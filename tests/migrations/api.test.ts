import type { DatabaseSync } from "node:sqlite";
import type { RequestHandler } from "@sveltejs/kit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { D1Database } from "$lib/server/db/d1-types";
import {
  GET as listPeriods,
  POST as createPeriod,
} from "../../src/routes/api/periods/+server";
import { GET as getPeriod } from "../../src/routes/api/periods/[periodId]/+server";
import { POST as addDay } from "../../src/routes/api/periods/[periodId]/days/[date]/add/+server";
import { PUT as overwriteDay } from "../../src/routes/api/periods/[periodId]/days/[date]/overwrite/+server";
import { GET as getHistory } from "../../src/routes/api/periods/[periodId]/days/[date]/history/+server";
import {
  DELETE as deleteHistory,
  PATCH as updateHistory,
} from "../../src/routes/api/periods/[periodId]/days/[date]/history/[historyId]/+server";
import { createRouteEvent } from "../integration/api/route-event-fixture";
import { applyMigrations, createMigrationDatabase } from "./database";
import { readMigrations } from "./history";
import {
  legacyProjection,
  legacyTables,
  preservedRows as rows,
} from "./preservation";
import { createSqliteD1 } from "./sqlite-d1";

const date = "2026-04-20";
const now = "2026-04-20T00:00:00.000Z";
const periodId = "migration-period";

async function request(
  db: D1Database,
  handler: RequestHandler,
  method: string,
  params: Record<string, string> = {},
  body?: Record<string, unknown>,
) {
  return handler(
    createRouteEvent({
      params,
      platform: { env: { DB: db }, cf: {}, ctx: { waitUntil() {} } },
      request: new Request("http://localhost/api/periods", {
        method,
        ...(body === undefined
          ? {}
          : {
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            }),
      }),
    }),
  );
}

function seedLegacy(db: DatabaseSync) {
  db.exec(`
    INSERT INTO budget_periods (id, start_date, end_date, budget_yen, status, predecessor_period_id, created_at, updated_at) VALUES
      ('${periodId}', '2026-04-20', '2026-05-19', 30000, 'active', NULL, '${now}', '${now}'),
      ('other-period', '2026-05-20', '2026-06-19', 40000, 'active', '${periodId}', '${now}', '${now}');
    INSERT INTO daily_totals (budget_period_id, date, year_month, total_used_yen, updated_at) VALUES
      ('${periodId}', '${date}', '2026-04', 95, '${now}'),
      ('other-period', '${date}', '2026-04', 900, '${now}');
    INSERT INTO daily_operation_histories (rowid, id, budget_period_id, date, operation_type, input_yen, before_total_yen, after_total_yen, memo, created_at) VALUES
      (90, 'm-last', '${periodId}', '${date}', 'add', 25, 70, 95, '最後', '${now}'),
      (10, 'z-first', '${periodId}', '${date}', 'add', 100, 0, 100, '最初', '${now}'),
      (40, 'a-middle', '${periodId}', '${date}', 'overwrite', 70, 100, 70, NULL, '${now}'),
      (25, 'other-history', 'other-period', '${date}', 'add', 900, 0, 900, '別の期間', '${now}');
  `);
}

describe("public API against migrated SQLite", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    vi.stubEnv("YOSAN_FLOW_FORCE_IN_MEMORY_DEV", "0");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(now));
    db = createMigrationDatabase();
  });

  afterEach(() => {
    db.close();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("reads, creates, adds and overwrites through the default routes after a fresh install", async () => {
    applyMigrations(db, readMigrations());
    const d1 = createSqliteD1(db);
    const empty = await request(d1, listPeriods, "GET");
    expect(empty.status).toBe(200);
    await expect(empty.json()).resolves.toEqual({ periods: [] });

    const created = await request(
      d1,
      createPeriod,
      "POST",
      {},
      {
        id: periodId,
        startDate: date,
        endDate: "2026-05-19",
        budgetYen: 30000,
      },
    );
    expect(created.status).toBe(201);

    for (const [handler, method, inputYen] of [
      [addDay, "POST", 100],
      [overwriteDay, "PUT", 40],
      [addDay, "POST", 25],
    ] as const) {
      const response = await request(
        d1,
        handler,
        method,
        { periodId, date },
        { inputYen },
      );
      expect(response.status).toBe(200);
    }
    const summary = await request(d1, getPeriod, "GET", { periodId });
    expect(summary.status).toBe(200);
    await expect(summary.json()).resolves.toMatchObject({
      plannedTotalYen: 65,
    });
    expect(db.prepare("SELECT total_used_yen FROM daily_totals").all()).toEqual(
      [{ total_used_yen: 65 }],
    );
    expect(
      db
        .prepare(
          "SELECT operation_type, before_total_yen, after_total_yen FROM daily_operation_histories ORDER BY rowid",
        )
        .all(),
    ).toEqual([
      { operation_type: "add", before_total_yen: 0, after_total_yen: 100 },
      {
        operation_type: "overwrite",
        before_total_yen: 100,
        after_total_yen: 40,
      },
      { operation_type: "add", before_total_yen: 40, after_total_yen: 65 },
    ]);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("preserves legacy records and replays same-timestamp histories by rowid after pending upgrades", async () => {
    const migrations = readMigrations();
    applyMigrations(db, migrations.slice(0, 2));
    seedLegacy(db);
    const before = rows(db);
    applyMigrations(db, migrations);
    expect(rows(db)).toEqual(before);
    const d1 = createSqliteD1(db);
    const history = await request(d1, getHistory, "GET", { periodId, date });
    expect(history.status).toBe(200);
    await expect(history.json()).resolves.toMatchObject({
      histories: [
        { id: "m-last", afterTotalYen: 95 },
        { id: "a-middle", afterTotalYen: 70 },
        { id: "z-first", afterTotalYen: 100 },
      ],
    });

    const removed = await request(d1, deleteHistory, "DELETE", {
      periodId,
      date,
      historyId: "a-middle",
    });
    expect(removed.status).toBe(200);
    await expect(removed.json()).resolves.toMatchObject({
      summary: { plannedTotalYen: 125 },
    });
    const updated = await request(
      d1,
      updateHistory,
      "PATCH",
      { periodId, date, historyId: "z-first" },
      { inputYen: 200, memo: "更新済み" },
    );
    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({
      summary: { plannedTotalYen: 225 },
      histories: [
        { id: "m-last", beforeTotalYen: 200, afterTotalYen: 225, memo: "最後" },
        {
          id: "z-first",
          beforeTotalYen: 0,
          afterTotalYen: 200,
          memo: "更新済み",
        },
      ],
    });
    expect(
      db
        .prepare(
          "SELECT rowid, id FROM daily_operation_histories WHERE budget_period_id = ? ORDER BY rowid",
        )
        .all(periodId),
    ).toEqual([
      { rowid: 10, id: "z-first" },
      { rowid: 90, id: "m-last" },
    ]);
    for (const [index, table] of legacyTables.entries()) {
      const key = table === "budget_periods" ? "id" : "budget_period_id";
      expect(
        db
          .prepare(
            `SELECT ${legacyProjection(table)} FROM ${table} WHERE ${key} = 'other-period' ORDER BY rowid`,
          )
          .all(),
      ).toEqual(before[index].filter((row) => row[key] === "other-period"));
    }
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("rolls back all SQLite writes when a later D1 batch statement fails", async () => {
    applyMigrations(db, readMigrations());
    seedLegacy(db);
    const before = rows(db);
    const d1 = createSqliteD1(db);
    await expect(
      d1.batch([
        d1
          .prepare(
            "UPDATE daily_totals SET total_used_yen = 1 WHERE budget_period_id = ?",
          )
          .bind(periodId),
        d1.prepare(
          "UPDATE daily_operation_histories SET input_yen = -1 WHERE id = 'z-first'",
        ),
      ]),
    ).rejects.toThrow(/CHECK constraint failed/);
    expect(rows(db)).toEqual(before);
    expect(await d1.prepare("SELECT 1 AS value").first<number>("value")).toBe(
      1,
    );
  });

  it("keeps raw column order and rejects unsupported adapter calls", async () => {
    const d1 = createSqliteD1(db);
    const statement = d1.prepare("SELECT ? AS same, ? AS same").bind(3, 7);
    await expect(statement.raw({ columnNames: true })).resolves.toEqual([
      ["same", "same"],
      [3, 7],
    ]);
    await expect(d1.prepare("SELECT 1 AS value").all()).resolves.toMatchObject({
      results: [{ value: 1 }],
    });
    await expect(
      d1.prepare("SELECT 1 AS value").first("missing"),
    ).rejects.toThrow(/Unknown/);
    expect(() => d1.prepare("SELECT 1; SELECT 2")).toThrow(/one SQL statement/);
    expect(() => d1.prepare("SELECT ?").bind({})).toThrow(/Unsupported/);
    await expect(d1.exec("SELECT 1")).rejects.toThrow(/not implemented/);
    expect(() => d1.withSession()).toThrow(/not implemented/);
    await expect(d1.dump()).rejects.toThrow(/not implemented/);
  });
});
