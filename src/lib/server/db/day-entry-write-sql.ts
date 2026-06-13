import type { D1Database, D1PreparedStatement } from "$lib/server/db/d1-types";
import type {
  D1DayEntryHistoryWriteInput,
  D1DayEntryTotalWriteInput,
  D1DayEntryWriteMode,
} from "$lib/server/db/day-entry-writer-types";

const CURRENT_TOTAL_SQL = `
  COALESCE(
    (
      SELECT total_used_yen
      FROM daily_totals
      WHERE budget_period_id = ? AND date = ?
    ),
    0
  )
`;

function buildAfterTotalSql(
  mode: D1DayEntryWriteMode,
  currentTotalSql: string,
): string {
  return mode === "add" ? `${currentTotalSql} + ?` : "?";
}

export function buildDailyEntryStatements(
  db: D1Database,
  input: {
    total: D1DayEntryTotalWriteInput;
    history: D1DayEntryHistoryWriteInput;
    mode: D1DayEntryWriteMode;
  },
): D1PreparedStatement[] {
  const afterTotalSql = buildAfterTotalSql(input.mode, CURRENT_TOTAL_SQL);
  return [
    buildHistoryInsertStatement(
      db,
      input.history,
      input.mode,
      CURRENT_TOTAL_SQL,
      afterTotalSql,
    ),
    buildDailyTotalUpsertStatement(db, input.total, input.mode),
  ];
}

function buildHistoryInsertStatement(
  db: D1Database,
  history: D1DayEntryHistoryWriteInput,
  mode: D1DayEntryWriteMode,
  currentTotalSql: string,
  afterTotalSql: string,
): D1PreparedStatement {
  return db
    .prepare(
      `
      INSERT INTO daily_operation_histories (
        id,
        budget_period_id,
        date,
        operation_type,
        input_yen,
        before_total_yen,
        after_total_yen,
        memo,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ${currentTotalSql}, ${afterTotalSql}, ?, ?)
      `,
    )
    .bind(
      history.id,
      history.budgetPeriodId,
      history.date,
      history.operationType,
      history.inputYen,
      history.budgetPeriodId,
      history.date,
      ...(mode === "add"
        ? [history.budgetPeriodId, history.date, history.inputYen]
        : [history.inputYen]),
      history.memo,
      history.createdAt,
    );
}

function buildDailyTotalUpsertStatement(
  db: D1Database,
  total: D1DayEntryTotalWriteInput,
  mode: D1DayEntryWriteMode,
): D1PreparedStatement {
  return db
    .prepare(
      `
      INSERT INTO daily_totals (
        budget_period_id,
        date,
        year_month,
        total_used_yen,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (budget_period_id, date) DO UPDATE SET
        year_month = excluded.year_month,
        total_used_yen = ${
          mode === "add"
            ? "daily_totals.total_used_yen + excluded.total_used_yen"
            : "excluded.total_used_yen"
        },
        updated_at = excluded.updated_at
      `,
    )
    .bind(
      total.budgetPeriodId,
      total.date,
      total.yearMonth,
      total.totalUsedYen,
      total.nowIso,
    );
}
