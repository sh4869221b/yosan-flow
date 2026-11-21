import { execFileSync } from "node:child_process";
import type { DatabaseSync } from "node:sqlite";
import { _createPeriodDayAddHandler } from "../../src/routes/api/periods/[periodId]/days/[date]/add/+server";
import legacyBatches from "./legacy-worker-f2ee86b-batches.json";
import { expect, it } from "vitest";
import { createD1ApiServices } from "#lib/server/services/api-services/d1.ts";
import { runApiEffect } from "#lib/server/effect/runtime.ts";
import { applyMigrations, createMigrationDatabase } from "./database";
import { readMigrations } from "./history";
import { createSqliteD1 } from "./sqlite-d1";

it("backfills commit order and preserves already-replayed legacy history chains", async () => {
  const db = createMigrationDatabase();
  try {
    const migrations = readMigrations();
    applyMigrations(db, migrations.slice(0, -1));
    db.exec(`
      INSERT INTO budget_periods (id, start_date, end_date, budget_yen, created_at, updated_at)
        VALUES ('.', '2026-07-01', '2026-07-31', 1000, 'c', 'u'),
          ('..', '2026-08-01', '2026-08-31', 1000, 'c', 'u');
      UPDATE budget_periods SET predecessor_period_id = '.' WHERE id = '..';
      INSERT INTO daily_operation_histories (rowid, id, budget_period_id, date, operation_type,
        input_yen, before_total_yen, after_total_yen, memo, created_at) VALUES
        (3, 'overwrite', '.', '2026-07-01', 'overwrite', 100, 0, 100, NULL, 'later'),
        (17, 'add', '.', '2026-07-01', 'add', 30, 100, 130, NULL, 'earlier'),
        (21, 'old-overwrite', '..', '2026-08-01', 'overwrite', 100, 30, 100, NULL, 'later'),
        (50, 'old-add', '..', '2026-08-01', 'add', 30, 0, 30, NULL, 'earlier');
      INSERT INTO daily_totals VALUES
        ('.', '2026-07-01', '2026-07', 130, 'u'),
        ('..', '2026-08-01', '2026-08', 100, 'u');
    `);
    applyMigrations(db, migrations);
    expect(
      db
        .prepare(
          "SELECT rowid, id, write_order FROM daily_operation_histories_v2 ORDER BY rowid",
        )
        .all(),
    ).toEqual([
      { rowid: 3, id: "overwrite", write_order: -2 },
      { rowid: 17, id: "add", write_order: -1 },
      { rowid: 21, id: "old-overwrite", write_order: -1 },
      { rowid: 50, id: "old-add", write_order: -2 },
    ]);
    const services = createD1ApiServices(createSqliteD1(db));
    expect(
      await runApiEffect(services.budgetPeriodRepository.findById("..")),
    ).toMatchObject({
      predecessorPeriodId: ".",
    });
    await runApiEffect(
      services.dayEntryService.updateHistoryEntry({
        periodId: ".",
        date: "2026-07-01",
        historyId: "add",
        inputYen: 40,
      }),
    );
    await runApiEffect(
      services.dayEntryService.updateHistoryEntry({
        periodId: "..",
        date: "2026-08-01",
        historyId: "old-add",
        inputYen: 40,
      }),
    );
    expect(
      await runApiEffect(services.listDailyTotalsByPeriodId(".")),
    ).toMatchObject([{ totalUsedYen: 140 }]);
    expect(
      await runApiEffect(services.listDailyTotalsByPeriodId("..")),
    ).toMatchObject([{ totalUsedYen: 100 }]);
  } finally {
    db.close();
  }
});

// Captured from the unmodified f2ee86b D1 writer and its public add handler.
// A overwrote 100; B added 40 and was edited, replaying B→A. The request
// timestamped between B and A then committed C's 5 with the old save key.
const legacyDay = { periodId: "legacy-mixed", date: "2026-07-01" };

function seedMixedPeriod(db: DatabaseSync) {
  db.exec(`
    INSERT INTO budget_periods (id, start_date, end_date, budget_yen, created_at, updated_at)
    VALUES ('legacy-mixed', '2026-07-01', '2026-07-01', 1000, 'c', 'u');
  `);
}

it("replays actual legacy batches, proves the mixed prefix and fences old writes", async () => {
  const db = createMigrationDatabase();
  try {
    const migrations = readMigrations();
    applyMigrations(db, migrations.slice(0, 3));
    seedMixedPeriod(db);
    const d1 = createSqliteD1(db);
    const executeLegacy = async (index: number) =>
      d1.batch(
        legacyBatches[index].map(({ sql, args }) =>
          d1.prepare(sql).bind(...args),
        ),
      );
    for (let index = 0; index < legacyBatches.length; index++) {
      await executeLegacy(index);
    }
    const readTotal = () =>
      db.prepare("SELECT total_used_yen FROM daily_totals").get()
        ?.total_used_yen;
    expect(readTotal()).toBe(105);

    // Applying just the previous branch's migration picked the incorrect rowid order.
    applyMigrations(db, migrations.slice(0, -1));
    expect(
      db
        .prepare(
          "SELECT id FROM daily_operation_histories ORDER BY write_order",
        )
        .all(),
    ).toEqual([{ id: "A" }, { id: "B" }, { id: "C" }]);
    applyMigrations(db, migrations);
    expect(readTotal()).toBe(105);

    const services = createD1ApiServices(d1);
    expect(
      await runApiEffect(
        services.listHistoryByDate(legacyDay.periodId, legacyDay.date),
      ),
    ).toMatchObject([
      { id: "C", beforeTotalYen: 100, afterTotalYen: 105 },
      { id: "A", beforeTotalYen: 40, afterTotalYen: 100 },
      { id: "B", beforeTotalYen: 0, afterTotalYen: 40 },
    ]);

    // An old edit or add hitting the same D1 cannot complete once the fence commits.
    const retired = Promise.allSettled([executeLegacy(2), executeLegacy(3)]);
    await runApiEffect(
      services.dayEntryService.updateHistoryEntry({
        ...legacyDay,
        historyId: "C",
        inputYen: 6,
        memo: "edited after upgrade",
      }),
    );
    for (const result of await retired) {
      expect(result).toMatchObject({
        status: "rejected",
        reason: expect.objectContaining({
          message: expect.stringContaining(
            "no such table: daily_operation_histories",
          ),
        }),
      });
    }
    expect(readTotal()).toBe(106);

    const add = _createPeriodDayAddHandler({ services });
    const send = (key?: string) =>
      add({
        params: legacyDay,
        request: new Request("http://localhost/day/add", {
          method: "POST",
          headers: key ? { "idempotency-key": key } : undefined,
          body: JSON.stringify({ inputYen: 5 }),
        }),
      } as Parameters<typeof add>[0]);
    for (const oldKey of [
      undefined,
      "old-save-key",
      `${"0".repeat(32)}.old-save-key`,
    ]) {
      const response = await send(oldKey);
      expect(response.status).toBe(412);
      expect(await response.json()).toMatchObject({
        error: { code: "DAY_ENTRY_EPOCH_REQUIRED" },
      });
    }
    expect(readTotal()).toBe(106);
    const epoch = await runApiEffect(services.getDayEntryEpoch());
    const key = `${epoch}.new-save-key`;
    const results = await Promise.all([send(key), send(key)]);
    expect(results.map(({ status }) => status)).toEqual([200, 200]);
    expect(readTotal()).toBe(111);
  } finally {
    db.close();
  }
});

it.each([
  ["ambiguous_order", 0],
  ["inconsistent_ledger", 100],
])("reports %s and rolls back activation", (issue, total) => {
  const db = createMigrationDatabase();
  try {
    const migrations = readMigrations();
    applyMigrations(db, migrations.slice(0, -1));
    seedMixedPeriod(db);
    db.exec(`
      INSERT INTO daily_operation_histories (id, budget_period_id, date, operation_type,
        input_yen, before_total_yen, after_total_yen, created_at)
      VALUES ('first', 'legacy-mixed', '2026-07-01', 'add', 0, 0, 0, 'later'),
             ('second', 'legacy-mixed', '2026-07-01', 'add', 0, 0, 0, 'earlier');
      INSERT INTO daily_totals VALUES ('legacy-mixed', '2026-07-01', '2026-07', ${total}, 'u');
    `);
    const query = execFileSync(
      process.execPath,
      ["scripts/day-entry-cutover-diagnostics.ts"],
      { encoding: "utf8" },
    );
    expect(db.prepare(query).all()).toEqual([
      { budget_period_id: "legacy-mixed", date: "2026-07-01", issue },
    ]);
    const stored = db
      .prepare("SELECT * FROM daily_operation_histories ORDER BY rowid")
      .all();
    expect(() => applyMigrations(db, migrations)).toThrow(
      /LEGACY_HISTORY_ORDER_UNRESOLVED/,
    );
    expect(
      db
        .prepare("SELECT * FROM daily_operation_histories ORDER BY rowid")
        .all(),
    ).toEqual(stored);
    expect(
      db.prepare("SELECT total_used_yen FROM daily_totals").get()
        ?.total_used_yen,
    ).toBe(total);
    expect(
      db
        .prepare(
          "SELECT name FROM sqlite_schema WHERE name LIKE '%cutover%' OR name LIKE '%_v2'",
        )
        .all(),
    ).toEqual([]);
  } finally {
    db.close();
  }
});

it("rejects a database with writes from the interim candidate", () => {
  const db = createMigrationDatabase();
  try {
    const migrations = readMigrations();
    applyMigrations(db, migrations.slice(0, -1));
    seedMixedPeriod(db);
    db.exec(`
      INSERT INTO day_entry_receipts VALUES ('old-key', 'old-fingerprint');
      INSERT INTO daily_totals VALUES ('legacy-mixed', '2026-07-01', '2026-07', 5, 'u');
      INSERT INTO daily_operation_histories (id, budget_period_id, date, operation_type,
        input_yen, before_total_yen, after_total_yen, created_at, write_order)
      VALUES ('interim', 'legacy-mixed', '2026-07-01', 'add', 5, 0, 5, 'now', 1);
    `);
    const diagnostics = execFileSync(
      process.execPath,
      ["scripts/day-entry-cutover-diagnostics.ts"],
      { encoding: "utf8" },
    );
    expect(db.prepare(diagnostics).all()).toEqual([
      { budget_period_id: null, date: null, issue: "interim_receipts" },
      {
        budget_period_id: "legacy-mixed",
        date: "2026-07-01",
        issue: "interim_writer",
      },
    ]);
    expect(() => applyMigrations(db, migrations)).toThrow(
      /LEGACY_HISTORY_ORDER_UNRESOLVED/,
    );
    expect(
      db.prepare("SELECT count(*) AS receipts FROM day_entry_receipts").get(),
    ).toEqual({ receipts: 1 });
  } finally {
    db.close();
  }
});
