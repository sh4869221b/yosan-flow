import type { DailyOperationHistoryRow } from "./types";

export function replayDailyHistoryRows(
  periodId: string,
  date: string,
  dailyOperationHistories: DailyOperationHistoryRow[],
  targetId: string,
  newAmount: number | null,
  deleting: boolean,
): number {
  let totalUsedYen = 0;
  const rows = dailyOperationHistories
    .filter(
      (row) =>
        row.budget_period_id === periodId &&
        row.date === date &&
        (!deleting || row.id !== targetId),
    )
    .sort(
      (left, right) =>
        left.write_order - right.write_order || left.rowid - right.rowid,
    );

  for (const row of rows) {
    row.before_total_yen = totalUsedYen;
    const input =
      row.id === targetId && newAmount !== null ? newAmount : row.input_yen;
    totalUsedYen = row.operation_type === "add" ? totalUsedYen + input : input;
    row.after_total_yen = totalUsedYen;
  }

  return totalUsedYen;
}
