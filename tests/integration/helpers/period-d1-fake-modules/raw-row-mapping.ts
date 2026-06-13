import type {
  BudgetPeriodRow,
  DailyOperationHistoryRow,
  DailyTotalRow,
} from "./types";

export function toBudgetPeriodRawRow(
  sql: string,
  row: BudgetPeriodRow,
): unknown[] {
  const normalizedSql = sql.toLowerCase();
  if (normalizedSql.includes('select "end_date" from "budget_periods"')) {
    return [row.end_date];
  }
  if (
    normalizedSql.startsWith('select "id", "start_date"') &&
    !normalizedSql.includes('"end_date"')
  ) {
    return [row.id, row.start_date];
  }
  if (
    normalizedSql.startsWith('select "id"') &&
    !normalizedSql.includes('"start_date"')
  ) {
    return [row.id];
  }

  return [
    row.id,
    row.start_date,
    row.end_date,
    row.budget_yen,
    row.status,
    row.predecessor_period_id,
    row.created_at,
    row.updated_at,
  ];
}

export function toDailyTotalRawRow(sql: string, row: DailyTotalRow): unknown[] {
  const normalizedSql = sql.toLowerCase();
  if (normalizedSql.startsWith('select "date"')) {
    return [row.date];
  }

  return [
    row.budget_period_id,
    row.date,
    row.year_month,
    row.total_used_yen,
    row.updated_at,
  ];
}

export function toDailyOperationHistoryRawRow(
  sql: string,
  row: DailyOperationHistoryRow,
): unknown[] {
  const normalizedSql = sql.toLowerCase();
  if (
    normalizedSql.startsWith('select "id"') &&
    !normalizedSql.includes('"budget_period_id"')
  ) {
    return [row.id];
  }

  return [
    row.id,
    row.budget_period_id,
    row.date,
    row.operation_type,
    row.input_yen,
    row.before_total_yen,
    row.after_total_yen,
    row.memo,
    row.created_at,
  ];
}
