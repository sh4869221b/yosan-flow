import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type {
  D1Database,
  D1PreparedStatement,
} from "#lib/server/db/d1-types.ts";
import { buildDailyEntryStatements } from "#lib/server/db/day-entry-write-sql.ts";

function sqliteHarness(start: string, end: string) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE budget_periods (id TEXT PRIMARY KEY, start_date TEXT, end_date TEXT);
    CREATE TABLE daily_totals (budget_period_id TEXT, date TEXT, year_month TEXT, total_used_yen INTEGER, updated_at TEXT, PRIMARY KEY (budget_period_id, date));
    CREATE TABLE daily_operation_histories (id TEXT PRIMARY KEY, budget_period_id TEXT, date TEXT, operation_type TEXT, input_yen INTEGER, before_total_yen INTEGER, after_total_yen INTEGER, memo TEXT, created_at TEXT);
  `);
  sqlite
    .prepare("INSERT INTO budget_periods VALUES (?, ?, ?)")
    .run("p", start, end);
  const db = {
    prepare(sql: string) {
      return {
        bind(...args: (string | number | null)[]) {
          return { run: () => sqlite.prepare(sql).run(...args) };
        },
      } as unknown as D1PreparedStatement;
    },
  } as D1Database;
  return { sqlite, db };
}

function write(db: D1Database, date: string, mode: "add" | "overwrite") {
  const statements = buildDailyEntryStatements(db, {
    mode,
    total: {
      budgetPeriodId: "p",
      date,
      yearMonth: date.slice(0, 7),
      totalUsedYen: 50,
      nowIso: "now",
    },
    history: {
      id: "h",
      budgetPeriodId: "p",
      date,
      operationType: mode,
      inputYen: 50,
      beforeTotalYen: 0,
      afterTotalYen: 50,
      memo: null,
      createdAt: "now",
    },
  });
  return statements.map((statement) => statement.run());
}

describe("daily entry write-time period guard in SQLite", () => {
  it.each(["add", "overwrite"] as const)(
    "writes both rows within the range for %s",
    (mode) => {
      const { sqlite, db } = sqliteHarness("2026-07-01", "2026-07-31");
      write(db, "2026-07-15", mode);
      expect(
        sqlite.prepare("SELECT total_used_yen FROM daily_totals").all(),
      ).toEqual([{ total_used_yen: 50 }]);
      expect(
        sqlite
          .prepare(
            "SELECT before_total_yen, after_total_yen FROM daily_operation_histories",
          )
          .all(),
      ).toEqual([{ before_total_yen: 0, after_total_yen: 50 }]);
      sqlite.close();
    },
  );

  it.each(["add", "overwrite"] as const)(
    "writes neither row after either boundary moves past the date for %s",
    (mode) => {
      for (const [start, end] of [
        ["2026-07-16", "2026-07-31"],
        ["2026-07-01", "2026-07-14"],
      ]) {
        const { sqlite, db } = sqliteHarness(start, end);
        write(db, "2026-07-15", mode);
        expect(sqlite.prepare("SELECT * FROM daily_totals").all()).toEqual([]);
        expect(
          sqlite.prepare("SELECT * FROM daily_operation_histories").all(),
        ).toEqual([]);
        sqlite.close();
      }
    },
  );
});
