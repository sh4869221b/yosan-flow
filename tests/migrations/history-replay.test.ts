import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createD1DayEntryWriter } from "#lib/server/db/day-entry-writer.ts";
import { buildHistoryReplayStatements } from "#lib/server/db/day-entry-replay-sql.ts";
import { runApiEffect } from "#lib/server/effect/runtime.ts";
import { applyMigrations, createMigrationDatabase } from "./database";
import { readMigrations } from "./history";
import { createSqliteD1 } from "./sqlite-d1";

const date = "2026-05-01";
const nowIso = "2026-05-01T00:00:00.000Z";
const command = {
  budgetPeriodId: "target",
  date,
  yearMonth: "2026-05",
  nowIso,
};

function seed(db: DatabaseSync, only: boolean) {
  const period = db.prepare(`INSERT INTO budget_periods
    (id, start_date, end_date, budget_yen, status, created_at, updated_at)
    VALUES (?, '2026-05-01', '2026-05-31', 1000, 'active', ?, ?)`);
  for (const id of ["target", "other"]) period.run(id, nowIso, nowIso);
  const history = db.prepare(`INSERT INTO daily_operation_histories
    (rowid, id, budget_period_id, date, operation_type, input_yen,
      before_total_yen, after_total_yen, memo, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`);
  // Insert out of rowid order; all timestamps tie, and IDs sort differently.
  history.run(
    90,
    "a-last",
    "target",
    date,
    "add",
    25,
    only ? 0 : 70,
    only ? 25 : 95,
    nowIso,
  );
  if (!only) {
    history.run(10, "z-first", "target", date, "add", 100, 0, 100, nowIso);
    history.run(
      40,
      "m-middle",
      "target",
      date,
      "overwrite",
      70,
      100,
      70,
      nowIso,
    );
  }
  history.run(100, "other-period", "other", date, "add", 900, 0, 900, nowIso);
  history.run(
    110,
    "other-date",
    "target",
    "2026-05-02",
    "add",
    800,
    0,
    800,
    nowIso,
  );
  const total = db.prepare(`INSERT INTO daily_totals
    (budget_period_id, date, year_month, total_used_yen, updated_at)
    VALUES (?, ?, '2026-05', ?, ?)`);
  total.run("target", date, only ? 25 : 95, nowIso);
  total.run("other", date, 900, nowIso);
  total.run("target", "2026-05-02", 800, nowIso);
}

function histories(db: DatabaseSync) {
  return db
    .prepare(
      `SELECT id, before_total_yen, after_total_yen
    FROM daily_operation_histories WHERE budget_period_id = 'target'
      AND date = ? ORDER BY created_at, rowid`,
    )
    .all(date);
}

describe("history replay totals against SQLite", () => {
  let db: DatabaseSync;
  beforeEach(() => {
    db = createMigrationDatabase();
    applyMigrations(db, readMigrations());
  });
  afterEach(() => db.close());

  it.each([
    [
      "update",
      "z-first",
      false,
      [
        ["z-first", 0, 200],
        ["m-middle", 200, 70],
        ["a-last", 70, 95],
      ],
      95,
    ],
    [
      "update",
      "m-middle",
      false,
      [
        ["z-first", 0, 100],
        ["m-middle", 100, 200],
        ["a-last", 200, 225],
      ],
      225,
    ],
    [
      "update",
      "a-last",
      false,
      [
        ["z-first", 0, 100],
        ["m-middle", 100, 70],
        ["a-last", 70, 270],
      ],
      270,
    ],
    [
      "delete",
      "z-first",
      false,
      [
        ["m-middle", 0, 70],
        ["a-last", 70, 95],
      ],
      95,
    ],
    [
      "delete",
      "m-middle",
      false,
      [
        ["z-first", 0, 100],
        ["a-last", 100, 125],
      ],
      125,
    ],
    [
      "delete",
      "a-last",
      false,
      [
        ["z-first", 0, 100],
        ["m-middle", 100, 70],
      ],
      70,
    ],
    ["update", "a-last", true, [["a-last", 0, 200]], 200],
    ["delete", "a-last", true, [], null],
  ] as const)(
    "%s %s (only=%s) reads the persisted final total",
    async (kind, historyId, only, expected, total) => {
      seed(db, only);
      const writer = createD1DayEntryWriter({ db: createSqliteD1(db) });
      await runApiEffect(
        writer.writeHistoryReplay({
          ...command,
          historyId,
          ...(kind === "update"
            ? { kind, inputYen: 200, memo: null }
            : { kind }),
        }),
      );
      expect(histories(db)).toEqual(
        expected.map(([id, before, after]) => ({
          id,
          before_total_yen: before,
          after_total_yen: after,
        })),
      );
      const target = db
        .prepare(
          "SELECT total_used_yen FROM daily_totals WHERE budget_period_id = 'target' AND date = ?",
        )
        .get(date);
      expect(target?.total_used_yen ?? null).toBe(total);
      expect(
        db
          .prepare(
            "SELECT id, after_total_yen FROM daily_operation_histories WHERE id IN ('other-date', 'other-period') ORDER BY id",
          )
          .all(),
      ).toEqual([
        { id: "other-date", after_total_yen: 800 },
        { id: "other-period", after_total_yen: 900 },
      ]);
      expect(
        db
          .prepare(
            "SELECT total_used_yen FROM daily_totals WHERE budget_period_id <> 'target' OR date <> ? ORDER BY total_used_yen",
          )
          .all(date),
      ).toEqual([{ total_used_yen: 800 }, { total_used_yen: 900 }]);
    },
  );

  it("orders different timestamps before rowid when selecting the final total", async () => {
    seed(db, false);
    db.prepare(
      "UPDATE daily_operation_histories SET created_at = ? WHERE id = 'z-first'",
    ).run("2026-05-01T01:00:00.000Z");
    const writer = createD1DayEntryWriter({ db: createSqliteD1(db) });
    await runApiEffect(
      writer.writeHistoryReplay({
        ...command,
        kind: "update",
        historyId: "m-middle",
        inputYen: 200,
        memo: null,
      }),
    );
    expect(histories(db)).toEqual([
      { id: "m-middle", before_total_yen: 0, after_total_yen: 200 },
      { id: "a-last", before_total_yen: 200, after_total_yen: 225 },
      { id: "z-first", before_total_yen: 225, after_total_yen: 325 },
    ]);
    expect(
      db
        .prepare(
          "SELECT total_used_yen FROM daily_totals WHERE budget_period_id = 'target' AND date = ?",
        )
        .get(date),
    ).toEqual({ total_used_yen: 325 });
  });

  it.each([
    ["update", ["a-last"], "m-middle", [100, 200, 225], 225],
    ["delete", ["a-last"], "m-middle", [100, 125], 125],
    ["update", ["m-middle", "a-last"], "z-first", [200, 70, 95], 95],
    ["delete", ["m-middle", "a-last"], "z-first", [70, 95], 95],
    ["update", ["z-first", "a-last"], "m-middle", [100, 200, 225], 225],
    ["delete", ["z-first", "a-last"], "m-middle", [100, 125], 125],
    ["update", ["z-first"], "m-middle", [100, 200, 225], 225],
    ["delete", ["z-first"], "m-middle", [100, 125], 125],
  ] as const)(
    "%s %s with legacy NULL IDs replays each physical history row",
    async (kind, nullIds, historyId, expectedTotals, expectedTotal) => {
      seed(db, false);
      const markLegacy = db.prepare(
        "UPDATE daily_operation_histories SET id = NULL, before_total_yen = 1, after_total_yen = 2 WHERE id = ?",
      );
      for (const id of nullIds) markLegacy.run(id);
      const beforeRows = db
        .prepare(
          "SELECT rowid, id FROM daily_operation_histories WHERE budget_period_id = 'target' AND date = ? ORDER BY created_at, rowid",
        )
        .all(date);
      const writer = createD1DayEntryWriter({ db: createSqliteD1(db) });
      await runApiEffect(
        writer.writeHistoryReplay({
          ...command,
          historyId,
          ...(kind === "update"
            ? { kind, inputYen: 200, memo: null }
            : { kind }),
        }),
      );
      const rows = db
        .prepare(
          "SELECT rowid, id, before_total_yen, after_total_yen FROM daily_operation_histories WHERE budget_period_id = 'target' AND date = ? ORDER BY created_at, rowid",
        )
        .all(date);
      expect(rows.map(({ rowid, id }) => ({ rowid, id }))).toEqual(
        beforeRows.filter((row) => kind !== "delete" || row.id !== historyId),
      );
      expect(rows.map((row) => row.after_total_yen)).toEqual(expectedTotals);
      expect(rows.map((row) => row.before_total_yen)).toEqual([
        0,
        ...expectedTotals.slice(0, -1),
      ]);
      expect(
        db
          .prepare(
            "SELECT total_used_yen FROM daily_totals WHERE budget_period_id = 'target' AND date = ?",
          )
          .get(date),
      ).toEqual({ total_used_yen: expectedTotal });
      expect(
        db
          .prepare(
            "SELECT id, after_total_yen FROM daily_operation_histories WHERE id IN ('other-date', 'other-period') ORDER BY id",
          )
          .all(),
      ).toEqual([
        { id: "other-date", after_total_yen: 800 },
        { id: "other-period", after_total_yen: 900 },
      ]);
    },
  );

  it("builds only one recursive replay and a scoped final persisted-row lookup", () => {
    const d1 = createSqliteD1(db);
    const prepare = vi.spyOn(d1, "prepare");
    buildHistoryReplayStatements(d1, {
      ...command,
      historyId: "a-last",
      kind: "delete",
    });
    const sql = prepare.mock.calls.map(([query]) => query);
    expect(sql).toHaveLength(4);
    expect(
      sql.filter((query) => query.includes("WITH RECURSIVE")),
    ).toHaveLength(1);
    expect(sql[3]).not.toContain("replay");
    expect(sql[3]).toContain('from "daily_operation_histories"');
    expect(sql[3]).toContain(
      'where ("daily_operation_histories"."budget_period_id" = ? and "daily_operation_histories"."date" = ?)',
    );
    expect(sql[3]).toContain(
      'order by "daily_operation_histories"."created_at" desc, rowid desc',
    );
  });

  it("rolls back history mutation and replay if the final total write fails", async () => {
    seed(db, false);
    const before = histories(db);
    db.exec(`CREATE TRIGGER reject_total BEFORE INSERT ON daily_totals
      BEGIN SELECT RAISE(ABORT, 'reject final total'); END;`);
    const writer = createD1DayEntryWriter({ db: createSqliteD1(db) });
    await expect(
      runApiEffect(
        writer.writeHistoryReplay({
          ...command,
          kind: "delete",
          historyId: "m-middle",
        }),
      ),
    ).rejects.toThrow("reject final total");
    expect(histories(db)).toEqual(before);
    expect(
      db
        .prepare(
          "SELECT total_used_yen FROM daily_totals WHERE budget_period_id = 'target' AND date = ?",
        )
        .get(date),
    ).toEqual({ total_used_yen: 95 });
  });
});
