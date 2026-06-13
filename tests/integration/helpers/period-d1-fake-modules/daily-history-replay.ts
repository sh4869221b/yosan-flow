import type { DailyOperationHistoryRow } from "./types";

export function replayDailyHistoryRows(
  periodId: string,
  date: string,
  dailyOperationHistories: DailyOperationHistoryRow[],
): number {
  let totalUsedYen = 0;
  const rows = dailyOperationHistories
    .filter((row) => row.budget_period_id === periodId && row.date === date)
    .sort((left, right) => {
      if (left.created_at === right.created_at) {
        return left.rowid - right.rowid;
      }
      return left.created_at.localeCompare(right.created_at);
    });

  for (const row of rows) {
    row.before_total_yen = totalUsedYen;
    totalUsedYen =
      row.operation_type === "add"
        ? totalUsedYen + row.input_yen
        : row.input_yen;
    row.after_total_yen = totalUsedYen;
  }

  return totalUsedYen;
}
