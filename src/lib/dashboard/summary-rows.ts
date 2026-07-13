import type { DailyRow, PeriodSummary } from "$lib/dashboard/controller-types";

export function findSummaryRow(
  summary: PeriodSummary,
  date: string | null,
): DailyRow | null {
  return date == null
    ? null
    : (summary.dailyRows.find((row) => row.date === date) ?? null);
}
