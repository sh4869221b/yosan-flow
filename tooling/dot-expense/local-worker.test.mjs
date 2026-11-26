import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createTestHarness } from "wrangler";

const appConfig = ".svelte-kit/cloudflare/worker/wrangler.json";
const origin = "https://example.test";
const max = Number.MAX_SAFE_INTEGER;
let harness, app, consumer, db, epoch, fixtureDir;

before(async () => {
  const config = JSON.parse(await readFile(appConfig, "utf8"));
  assert.equal(config.name, "yosan-flow", "Build the local Worker first");
  assert.deepEqual(
    config.d1_databases.map(({ binding, database_id }) => [
      binding,
      database_id,
    ]),
    [["DB", "00000000-0000-0000-0000-000000000000"]],
  );
  assert.ok(config.d1_databases.every(({ remote }) => !remote));
  fixtureDir = await mkdtemp(".tmp-dot-worker-");
  const entry = join(fixtureDir, "dispatch.mjs");
  // Supply synthetic queue events inside workerd so the consumer uses the real
  // YOSAN service binding. The production consumer still exports queue only.
  await writeFile(
    entry,
    `
    import consumer from "../tooling/dot-expense/worker.mjs";
    export default {
      async fetch(request, env) {
        const result = [];
        await consumer.queue({ messages: [{
          body: await request.json(),
          ack: () => result.push("ack"),
          retry: () => result.push("retry"),
        }] }, env);
        return Response.json(result);
      },
    };
  `,
  );
  harness = createTestHarness({
    workers: [
      { configPath: appConfig },
      {
        config: {
          name: "dot-expense-test",
          main: entry,
          compatibility_date: config.compatibility_date,
          vars: { YOSAN_ORIGIN: origin },
          services: [{ binding: "YOSAN", service: config.name }],
        },
      },
    ],
  });
  await harness.listen();
  app = harness.getWorker();
  consumer = harness.getWorker("dot-expense-test");
  await app.applyD1Migrations("DB");
  ({ DB: db } = await app.getEnv());
  epoch = await db
    .prepare("SELECT epoch FROM day_entry_cutover")
    .first("epoch");
  assert.match(epoch, /^[a-f0-9]{32}$/);
});

after(async () => {
  try {
    await harness?.close();
  } finally {
    if (fixtureDir) await rm(fixtureDir, { recursive: true, force: true });
  }
});

function request(worker, path, method, body, key) {
  return worker.fetch(origin + path, {
    method,
    headers: {
      origin,
      "content-type": "application/json",
      ...(key && { "idempotency-key": key }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function createPeriod(id, startDate) {
  const response = await request(app, "/api/periods", "POST", {
    id,
    startDate,
    endDate: startDate.slice(0, -2) + "28",
    budgetYen: max,
  });
  assert.equal(response.status, 201, await response.clone().text());
  assert.equal((await response.json()).id, id);
}

const periodPath = (id) => "/api/periods/" + encodeURIComponent(id);
const dayPath = (id, date) => periodPath(id) + "/days/" + date;
const keyFor = (n) => epoch + ".dot_" + n.toString(16).padStart(32, "0");

function receipt(key) {
  return db
    .prepare("SELECT fingerprint FROM day_entry_receipts_v2 WHERE key = ?")
    .bind(key)
    .first("fingerprint");
}

async function assertOverflow(response) {
  assert.equal(response.status, 400, await response.clone().text());
  assert.equal((await response.json()).error.code, "YEN_TOTAL_OUT_OF_RANGE");
}

test("an over-limit legacy period acknowledges a committed budget PUT while a concurrent add is rejected", async () => {
  const id = "legacy-period-cap";
  const first = "2028-11-01";
  const second = "2028-11-02";
  await createPeriod(id, first);
  await db.batch([
    db
      .prepare("UPDATE budget_periods SET budget_yen = 500 WHERE id = ?")
      .bind(id),
    ...[
      [first, max],
      [second, 2],
    ].flatMap(([date, amount], index) => [
      db
        .prepare(
          `
        INSERT INTO daily_totals (budget_period_id, date, year_month, total_used_yen, updated_at)
        VALUES (?, ?, '2028-11', ?, '2028-11-01T00:00:00Z')
      `,
        )
        .bind(id, date, amount),
      db
        .prepare(
          `
        INSERT INTO daily_operation_histories_v2
        (id, budget_period_id, date, operation_type, input_yen, before_total_yen,
          after_total_yen, created_at, write_order)
        VALUES (?, ?, ?, 'add', ?, 0, ?, '2028-11-01T00:00:00Z', 1)
      `,
        )
        .bind(`legacy-period-cap-${index}`, id, date, amount, amount),
    ]),
  ]);
  const path = periodPath(id);
  await assertOverflow(await request(app, path, "GET"));
  const [budget, add] = await Promise.all([
    request(app, path, "PUT", { budgetYen: 777 }),
    request(
      app,
      dayPath(id, second) + "/add",
      "POST",
      { inputYen: 1 },
      keyFor(40),
    ),
  ]);
  assert.equal(budget.status, 200, await budget.clone().text());
  const body = await budget.json();
  assert.equal(body.period.id, id);
  assert.equal(body.period.budgetYen, 777);
  assert.equal(body.summary, null);
  assert.equal(body.summaryError.code, "YEN_TOTAL_OUT_OF_RANGE");
  await assertOverflow(add);
  assert.equal(await receipt(keyFor(40)), null);
  assert.equal(
    await db
      .prepare("SELECT budget_yen FROM budget_periods WHERE id = ?")
      .bind(id)
      .first("budget_yen"),
    777,
  );
  const totals = await db
    .prepare(
      "SELECT total_used_yen FROM daily_totals WHERE budget_period_id = ? ORDER BY date",
    )
    .bind(id)
    .all();
  assert.deepEqual(totals.results, [
    { total_used_yen: max },
    { total_used_yen: 2 },
  ]);
  const repaired = await request(
    app,
    dayPath(id, second) + "/history/legacy-period-cap-1",
    "DELETE",
  );
  assert.equal(repaired.status, 200);
  assert.equal((await repaired.json()).summary.budgetYen, 777);
});

test("creating malformed UTF-16 period IDs writes no row and well-formed IDs round trip", async () => {
  for (const id of ["broken-\uD800", "broken-\uDC00"]) {
    const response = await request(app, "/api/periods", "POST", {
      id,
      startDate: "2029-01-01",
      endDate: "2029-01-28",
      budgetYen: 500,
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "INVALID_PERIOD_ID");
  }
  assert.equal(
    await db
      .prepare(
        "SELECT count(*) AS count FROM budget_periods WHERE start_date = '2029-01-01'",
      )
      .first("count"),
    0,
  );
  const id = "食費🍙 50%";
  await createPeriod(id, "2029-01-01");
  const summary = await request(app, periodPath(id), "GET");
  assert.equal(summary.status, 200);
  assert.equal((await summary.json()).periodId, id);
});

test("Dot saves app-created period IDs with reserved characters through the service binding", async () => {
  const periods = [
    ["食費 50%", "2028-01-01"],
    [" %2e%2e/\\? #\t ", "2028-03-01"],
    ["制御\u0000文字\n", "2028-05-01"],
    ["x".repeat(257), "2028-06-01"],
  ];
  for (const [index, [periodId, date]] of periods.entries()) {
    await createPeriod(periodId, date);
    const idempotencyKey = keyFor(index + 1);
    const body = {
      periodId,
      date,
      inputYen: 120,
      memo: " 昼食 ",
      idempotencyKey,
    };
    const fingerprint = createHash("sha256")
      .update(JSON.stringify([periodId, date, "add", 120, "昼食"]))
      .digest("hex");
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await request(consumer, "/", "POST", body);
      assert.deepEqual(await response.json(), ["ack"]);
      assert.equal(await receipt(idempotencyKey), fingerprint);
    }
    const result = await request(
      app,
      dayPath(periodId, date) + "/history",
      "GET",
    );
    assert.equal(result.status, 200);
    const { histories } = await result.json();
    assert.deepEqual(
      histories.map(({ inputYen, beforeTotalYen, afterTotalYen, memo }) => ({
        inputYen,
        beforeTotalYen,
        afterTotalYen,
        memo,
      })),
      [{ inputYen: 120, beforeTotalYen: 0, afterTotalYen: 120, memo: "昼食" }],
    );
  }
});

test("local D1 enforces daily and period yen caps within the receipt transaction", async () => {
  const id = "atomic-yen";
  const date = "2028-07-01";
  await createPeriod(id, date);
  const path = dayPath(id, date) + "/add";
  const add = (yen, key, endpoint = path) =>
    request(app, endpoint, "POST", { inputYen: yen }, key);
  assert.equal((await add(max - 2, keyFor(10))).status, 200);
  const keys = [keyFor(11), keyFor(12)];
  const responses = await Promise.all(keys.map((key) => add(2, key)));
  const committed = responses.findIndex(({ status }) => status === 200);
  assert.notEqual(committed, -1);
  assert.equal((await responses[committed].json()).plannedTotalYen, max);
  await assertOverflow(responses[1 - committed]);
  assert.equal(await receipt(keys[1 - committed]), null);
  assert.equal((await add(2, keys[committed])).status, 200);
  const conflict = await add(1, keys[committed]);
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).error.code, "DAY_ENTRY_KEY_CONFLICT");
  await assertOverflow(await add(2, keyFor(13)));
  await assertOverflow(
    await add(1, keyFor(14), dayPath(id, "2028-07-02") + "/add"),
  );
  for (const n of [13, 14]) assert.equal(await receipt(keyFor(n)), null);
  const history = await request(app, dayPath(id, date) + "/history", "GET");
  assert.deepEqual(
    (await history.json()).histories.map((row) => row.afterTotalYen),
    [max, max - 2],
  );
  const totals = await db
    .prepare(
      "SELECT date, total_used_yen, typeof(total_used_yen) AS storage FROM daily_totals WHERE budget_period_id = ?",
    )
    .bind(id)
    .all();
  assert.deepEqual(totals.results, [
    { date, total_used_yen: max, storage: "integer" },
  ]);
});

test("local D1 rejects overflowing history updates and deletes before changing either table", async () => {
  const id = "replay-yen";
  const date = "2028-08-01";
  await createPeriod(id, date);
  const day = dayPath(id, date);
  const entries = [
    ["add", max],
    ["overwrite", 0],
    ["add", 2],
    ["overwrite", 1],
  ];
  for (const [index, [mode, inputYen]] of entries.entries()) {
    const response = await request(
      app,
      day + "/" + mode,
      mode === "add" ? "POST" : "PUT",
      { inputYen },
      keyFor(20 + index),
    );
    assert.equal(response.status, 200, await response.clone().text());
  }
  const history = () =>
    request(app, day + "/history", "GET").then((response) => response.json());
  const before = await history();
  const overwrite = before.histories.find(
    (row) => row.operationType === "overwrite" && row.inputYen === 0,
  );
  const path = day + "/history/" + overwrite.id;
  await assertOverflow(await request(app, path, "DELETE"));
  await assertOverflow(
    await request(app, path, "PATCH", { inputYen: max, memo: "reject" }),
  );
  assert.deepEqual(await history(), before);
  const updated = await request(app, path, "PATCH", {
    inputYen: max - 2,
    memo: "accepted",
  });
  assert.equal(updated.status, 200);
  const { summary, histories } = await updated.json();
  assert.equal(summary.plannedTotalYen, 1);
  assert.deepEqual(
    histories.map((row) => row.afterTotalYen),
    [1, max, max - 2, max],
  );
});

test("local D1 leaves legacy out-of-range INTEGER and REAL amounts as stored", async () => {
  const id = "legacy-yen";
  const date = "2028-10-01";
  await createPeriod(id, date);
  const day = dayPath(id, date);
  const original = await request(
    app,
    day + "/add",
    "POST",
    { inputYen: 1 },
    keyFor(30),
  );
  assert.equal(original.status, 200);
  const readHistory = () => request(app, day + "/history", "GET");
  const {
    histories: [entry],
  } = await (await readHistory()).json();
  const rawTotal = () =>
    db
      .prepare(
        "SELECT CAST(total_used_yen AS TEXT) AS value, typeof(total_used_yen) AS storage FROM daily_totals WHERE budget_period_id = ?",
      )
      .bind(id)
      .first();
  for (const [expression, value, storage] of [
    ["CAST('9007199254740993' AS INTEGER)", "9007199254740993", "integer"],
    ["1.5", "1.5", "real"],
  ]) {
    await db
      .prepare(
        `UPDATE daily_totals SET total_used_yen = ${expression} WHERE budget_period_id = ?`,
      )
      .bind(id)
      .run();
    await assertOverflow(await request(app, periodPath(id), "GET"));
    await assertOverflow(
      await request(
        app,
        day + "/overwrite",
        "PUT",
        { inputYen: 5 },
        keyFor(31),
      ),
    );
    await assertOverflow(
      await request(app, day + "/history/" + entry.id, "DELETE"),
    );
    assert.equal(await receipt(keyFor(31)), null);
    assert.deepEqual(await rawTotal(), { value, storage });
    assert.deepEqual((await (await readHistory()).json()).histories, [entry]);
  }
  await db
    .prepare(
      "UPDATE daily_totals SET total_used_yen = 1 WHERE budget_period_id = ?",
    )
    .bind(id)
    .run();
  await db
    .prepare(
      "UPDATE daily_operation_histories_v2 SET after_total_yen = 1.5 WHERE id = ?",
    )
    .bind(entry.id)
    .run();
  await assertOverflow(await readHistory());
  await assertOverflow(
    await request(app, day + "/history/" + entry.id, "PATCH", { inputYen: 2 }),
  );
  assert.equal(
    await db
      .prepare(
        "SELECT after_total_yen FROM daily_operation_histories_v2 WHERE id = ?",
      )
      .bind(entry.id)
      .first("after_total_yen"),
    1.5,
  );
});

test("a business code in a Drizzle bind value leaves the DB failure as HTTP 500", async () => {
  await db
    .prepare(
      `
    CREATE TRIGGER temporary_period_failure BEFORE INSERT ON budget_periods
    WHEN NEW.id = 'PERIOD_NOT_FOUND'
    BEGIN SELECT RAISE(ABORT, 'fixture storage failure'); END
  `,
    )
    .run();
  const missing = await request(app, "/api/periods/PERIOD_NOT_FOUND", "GET");
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error.code, "PERIOD_NOT_FOUND");
  const failed = await request(app, "/api/periods", "POST", {
    id: "PERIOD_NOT_FOUND",
    startDate: "2028-12-01",
    endDate: "2028-12-31",
    budgetYen: 1000,
  });
  assert.equal(failed.status, 500);
  assert.equal((await failed.json()).error.code, "INTERNAL_ERROR");
});
