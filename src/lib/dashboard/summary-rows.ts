import type {
  DailyRow,
  PeriodSummary,
} from "#lib/dashboard/controller-types.ts";

export function findSummaryRow(
  summary: PeriodSummary,
  date: string | null,
): DailyRow | null {
  return date == null
    ? null
    : (summary.dailyRows.find((row) => row.date === date) ?? null);
}

// Add operations only increase totals and can only add recorded dates. Merge
// those facts across concurrent success snapshots until reconciliation runs.
export function mergeAddedSummary(
  candidate: PeriodSummary,
  current: PeriodSummary | null,
): PeriodSummary {
  if (current == null || current.periodId !== candidate.periodId)
    return candidate;
  const base =
    candidate.plannedTotalYen > current.plannedTotalYen ? candidate : current;
  const other = base === candidate ? current : candidate;
  const recordedDates = new Set(
    other.dailyRows.filter((row) => row.isRecorded).map((row) => row.date),
  );
  let changed = false;
  const dailyRows = base.dailyRows.map((row) => {
    if (row.isRecorded || !recordedDates.has(row.date)) return row;
    changed = true;
    return { ...row, isRecorded: true };
  });
  return changed ? { ...base, dailyRows } : base;
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
    (candidate.plannedTotalYen === current.plannedTotalYen &&
      candidate.dailyRows.length === current.dailyRows.length &&
      candidate.dailyRows.every(
        (row, index) =>
          row.date === current.dailyRows[index]?.date &&
          row.isRecorded === current.dailyRows[index]?.isRecorded,
      ))
  );
}
