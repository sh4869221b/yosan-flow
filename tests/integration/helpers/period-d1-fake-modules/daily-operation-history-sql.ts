import { filterEntriesOutsideRange } from "./entries-outside-range";
import type { PeriodAwareD1FakeState } from "./table-state";
import type { DailyOperationHistoryRow } from "./types";

export function queryDailyOperationHistories(
  sql: string,
  args: unknown[],
  state: PeriodAwareD1FakeState,
): DailyOperationHistoryRow[] {
  const normalizedSql = sql.toLowerCase();
  if (!normalizedSql.includes("daily_operation_histories_v2")) {
    return [];
  }

  const rows = [...state.dailyOperationHistories];
  if (
    normalizedSql.includes(
      '"daily_operation_histories_v2"."budget_period_id" = ?',
    ) &&
    normalizedSql.includes('"daily_operation_histories_v2"."date" = ?') &&
    normalizedSql.includes('"daily_operation_histories_v2"."id" = ?') &&
    normalizedSql.includes("limit ?")
  ) {
    return rows
      .filter(
        (row) =>
          row.budget_period_id === String(args[0]) &&
          row.date === String(args[1]) &&
          row.id === String(args[2]),
      )
      .slice(0, Number(args[3]));
  }
  if (
    normalizedSql.includes(
      '"daily_operation_histories_v2"."budget_period_id" = ?',
    ) &&
    normalizedSql.includes('"daily_operation_histories_v2"."date" = ?')
  ) {
    const periodId = String(args[0]);
    const date = String(args[1]);
    return rows
      .filter((row) => row.budget_period_id === periodId && row.date === date)
      .sort(
        (left, right) =>
          (right.write_order || right.rowid) -
            (left.write_order || left.rowid) || right.rowid - left.rowid,
      );
  }
  if (
    normalizedSql.includes(
      '"daily_operation_histories_v2"."budget_period_id" = ?',
    ) &&
    (normalizedSql.includes('"daily_operation_histories_v2"."date" < ?') ||
      normalizedSql.includes('"daily_operation_histories_v2"."date" > ?'))
  ) {
    return filterEntriesOutsideRange(rows, args);
  }

  return rows;
}
