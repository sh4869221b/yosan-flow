import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import baseline from "../../migrations/meta/20261002021516_snapshot.json";

export const legacyTables = [
  "budget_periods",
  "daily_totals",
  "daily_operation_histories",
] as const;
export const legacyData = readFileSync(
  new URL("./legacy-data.sql", import.meta.url),
  "utf8",
);

export function legacyProjection(table: keyof typeof baseline.tables) {
  return `rowid, ${Object.keys(baseline.tables[table].columns).join(", ")}`;
}

export function preservedRows(db: DatabaseSync) {
  return legacyTables.map((table) =>
    db
      .prepare(`SELECT ${legacyProjection(table)} FROM ${table} ORDER BY rowid`)
      .all(),
  );
}

export function verifyConstraints(db: DatabaseSync) {
  const violations = [
    [
      "INSERT INTO budget_periods SELECT * FROM budget_periods WHERE id IS NOT NULL LIMIT 1",
      "UNIQUE",
    ],
    ["INSERT INTO daily_totals SELECT * FROM daily_totals LIMIT 1", "UNIQUE"],
    [
      "INSERT INTO daily_operation_histories SELECT * FROM daily_operation_histories WHERE id IS NOT NULL LIMIT 1",
      "UNIQUE",
    ],
    [
      "UPDATE budget_periods SET predecessor_period_id = 'missing' WHERE id = 'period-current'",
      "FOREIGN KEY",
    ],
    [
      "UPDATE daily_totals SET budget_period_id = 'missing' WHERE rowid = 4",
      "FOREIGN KEY",
    ],
    [
      "UPDATE daily_operation_histories SET budget_period_id = 'missing'",
      "FOREIGN KEY",
    ],
    ["UPDATE budget_periods SET budget_yen = -1", "CHECK"],
    ["UPDATE budget_periods SET status = 'invalid'", "CHECK"],
    ["UPDATE budget_periods SET end_date = '1900-01-01'", "CHECK"],
    ["UPDATE daily_totals SET total_used_yen = -1", "CHECK"],
    [
      "UPDATE daily_operation_histories SET operation_type = 'invalid'",
      "CHECK",
    ],
    ...["input_yen", "before_total_yen", "after_total_yen"].map((column) => [
      `UPDATE daily_operation_histories SET ${column} = -1`,
      "CHECK",
    ]),
  ];
  for (const [sql, error] of violations) {
    db.exec("SAVEPOINT constraint_probe");
    try {
      assert.throws(
        () => db.exec(sql),
        new RegExp(`${error} constraint failed`),
        `Constraint missing: ${sql}`,
      );
    } finally {
      db.exec("ROLLBACK TO constraint_probe; RELEASE constraint_probe");
    }
  }
}
