import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createD1DayEntryWriter,
  DailyEntryPeriodRangeError,
} from "#lib/server/db/day-entry-writer.ts";
import { runApiEffect } from "#lib/server/effect/runtime.ts";
import {
  applyMigrations,
  createMigrationDatabase,
} from "../migrations/database";
import { readMigrations } from "../migrations/history";
import { createSqliteD1 } from "../migrations/sqlite-d1";

const periodId = "period-'quoted";
const date = "2026-07-15";
const nowIso = "2026-07-15T00:00:00.000Z";
const memo = "日本語のメモ'); DELETE FROM daily_totals; --";

function command(
  id: string,
  amount: number,
  mode: "add" | "overwrite" = "add",
) {
  return {
    mode,
    total: {
      budgetPeriodId: periodId,
      date,
      yearMonth: "2026-07",
      totalUsedYen: amount,
      nowIso,
    },
    history: {
      id,
      budgetPeriodId: periodId,
      date,
      operationType: mode,
      inputYen: amount,
      // Deliberately stale: the atomic SQL must read the stored total instead.
      beforeTotalYen: 999,
      afterTotalYen: 999,
      memo,
      createdAt: nowIso,
    },
  };
}

function seed(db: DatabaseSync) {
  db.prepare(
    `INSERT INTO budget_periods
      (id, start_date, end_date, budget_yen, status, created_at, updated_at)
      VALUES (?, '2026-07-01', '2026-07-31', 1000, 'active', ?, ?)`,
  ).run(periodId, nowIso, nowIso);
}

function totals(db: DatabaseSync) {
  return db.prepare("SELECT total_used_yen FROM daily_totals").all();
}

function histories(db: DatabaseSync) {
  return db
    .prepare(
      "SELECT id, before_total_yen, after_total_yen, memo FROM daily_operation_histories ORDER BY rowid",
    )
    .all();
}

describe("Drizzle-generated day-entry atomic batch", () => {
  let db: DatabaseSync;
  beforeEach(() => {
    db = createMigrationDatabase();
    applyMigrations(db, readMigrations());
    seed(db);
  });
  afterEach(() => db.close());

  it("binds quoted input and computes add/overwrite totals inside each atomic batch", async () => {
    const d1 = createSqliteD1(db);
    const batch = vi.spyOn(d1, "batch");
    const prepare = vi.spyOn(d1, "prepare");
    const writer = createD1DayEntryWriter({ db: d1 });
    await Promise.all([
      runApiEffect(writer.writeDailyEntry(command("first'", 100))),
      runApiEffect(writer.writeDailyEntry(command("second'", 25))),
    ]);
    await runApiEffect(
      writer.writeDailyEntry(command("overwrite'", 70, "overwrite")),
    );
    await runApiEffect(writer.writeDailyEntry(command("last'", 5)));
    expect(totals(db)).toEqual([{ total_used_yen: 75 }]);
    expect(histories(db)).toEqual([
      { id: "first'", before_total_yen: 0, after_total_yen: 100, memo },
      { id: "second'", before_total_yen: 100, after_total_yen: 125, memo },
      { id: "overwrite'", before_total_yen: 125, after_total_yen: 70, memo },
      { id: "last'", before_total_yen: 70, after_total_yen: 75, memo },
    ]);
    expect(batch).toHaveBeenCalledTimes(4);
    expect(
      batch.mock.calls.every(([statements]) => statements.length === 2),
    ).toBe(true);
    for (const [query] of prepare.mock.calls) {
      expect(query).not.toContain(periodId);
      expect(query).not.toContain(memo);
      expect(query).not.toContain(date);
    }
  });

  it.each(["missing", "shortened"])(
    "writes neither row and preserves the range error when the period is %s",
    async (state) => {
      if (state === "missing") {
        db.prepare("DELETE FROM budget_periods WHERE id = ?").run(periodId);
      } else {
        db.prepare(
          "UPDATE budget_periods SET end_date = '2026-07-14' WHERE id = ?",
        ).run(periodId);
      }
      const writer = createD1DayEntryWriter({ db: createSqliteD1(db) });
      await expect(
        runApiEffect(writer.writeDailyEntry(command("guarded", 100))),
      ).rejects.toBeInstanceOf(DailyEntryPeriodRangeError);
      expect(totals(db)).toEqual([]);
      expect(histories(db)).toEqual([]);
    },
  );

  it("rolls back both writes on a duplicate history ID", async () => {
    const writer = createD1DayEntryWriter({ db: createSqliteD1(db) });
    await runApiEffect(writer.writeDailyEntry(command("same", 100)));
    const before = histories(db);
    await expect(
      runApiEffect(writer.writeDailyEntry(command("same", 25))),
    ).rejects.toThrow("UNIQUE constraint failed");
    expect(totals(db)).toEqual([{ total_used_yen: 100 }]);
    expect(histories(db)).toEqual(before);
  });

  it("rolls back the new history when the total statement fails", async () => {
    db.exec(`CREATE TRIGGER reject_total BEFORE INSERT ON daily_totals
      BEGIN SELECT RAISE(ABORT, 'reject total'); END;`);
    const writer = createD1DayEntryWriter({ db: createSqliteD1(db) });
    await expect(
      runApiEffect(writer.writeDailyEntry(command("rollback", 100))),
    ).rejects.toThrow("reject total");
    expect(totals(db)).toEqual([]);
    expect(histories(db)).toEqual([]);
  });
});
