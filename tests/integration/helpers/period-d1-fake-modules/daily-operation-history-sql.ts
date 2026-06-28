import type { PeriodAwareD1FakeState } from "./table-state";
import type { DailyOperationHistoryRow } from "./types";

export function queryDailyOperationHistories(
  sql: string,
  args: unknown[],
  state: PeriodAwareD1FakeState,
): DailyOperationHistoryRow[] {
  const normalizedSql = sql.toLowerCase();
  if (!normalizedSql.includes("daily_operation_histories")) {
    return [];
  }

  const rows = [...state.dailyOperationHistories];
  if (
    normalizedSql.includes(
      '"daily_operation_histories"."budget_period_id" = ?',
    ) &&
    normalizedSql.includes('"daily_operation_histories"."date" = ?')
  ) {
    const periodId = String(args[0]);
    const date = String(args[1]);
    return rows
      .filter((row) => row.budget_period_id === periodId && row.date === date)
      .sort((left, right) => {
        if (left.created_at === right.created_at) {
          return right.rowid - left.rowid;
        }
        return right.created_at.localeCompare(left.created_at);
      });
  }
  if (
    normalizedSql.includes(
      '"daily_operation_histories"."budget_period_id" = ?',
    ) &&
    (normalizedSql.includes('"daily_operation_histories"."date" < ?') ||
      normalizedSql.includes('"daily_operation_histories"."date" > ?'))
  ) {
    const periodId = String(args[0]);
    const startDate = String(args[1]);
    const endDate = String(args[2]);
    return rows.filter(
      (row) =>
        row.budget_period_id === periodId &&
        (row.date < startDate || row.date > endDate),
    );
  }

  return rows;
}
