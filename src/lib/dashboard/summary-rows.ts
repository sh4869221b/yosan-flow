import type { DailyRow, PeriodSummary } from "$lib/dashboard/controller-types";

export function findSummaryRow(
  summary: PeriodSummary,
  date: string | null,
): DailyRow | null {
  return date == null
    ? null
    : (summary.dailyRows.find((row) => row.date === date) ?? null);
}

export function summaryIsMoreComplete(
  candidate: PeriodSummary,
  current: PeriodSummary | null,
): boolean {
  return (
    current == null ||
    current.periodId !== candidate.periodId ||
    candidate.plannedTotalYen > current.plannedTotalYen
  );
}

export function summaryConfigurationMatches(
  candidate: PeriodSummary,
  current: PeriodSummary | null,
): boolean {
  return (
    current == null ||
    current.periodId !== candidate.periodId ||
    (candidate.budgetYen === current.budgetYen &&
      candidate.startDate === current.startDate &&
      candidate.endDate === current.endDate)
  );
}

export function summarySpendingMatches(
  candidate: PeriodSummary,
  current: PeriodSummary | null,
): boolean {
  return (
    current == null ||
    current.periodId !== candidate.periodId ||
    candidate.plannedTotalYen === current.plannedTotalYen
  );
}
