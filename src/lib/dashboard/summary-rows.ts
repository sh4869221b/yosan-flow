import type {
  DailyRow,
  PeriodSummary,
} from "#lib/dashboard/controller-types.ts";

// Summaries emit daily rows in ascending ISO date order.
export function firstRowIndexOnOrAfter(
  rows: readonly DailyRow[],
  date: string,
): number {
  let start = 0;
  let end = rows.length;
  while (start < end) {
    const middle = start + Math.floor((end - start) / 2);
    if (rows[middle].date < date) start = middle + 1;
    else end = middle;
  }
  return start;
}

export function findSummaryRow(
  summary: PeriodSummary,
  date: string | null,
): DailyRow | null {
  if (date == null) return null;
  const row =
    summary.dailyRows[firstRowIndexOnOrAfter(summary.dailyRows, date)];
  return row?.date === date ? row : null;
}

// Add operations only increase totals and can only add recorded dates. Merge
// those facts across concurrent success snapshots until reconciliation runs.
export function mergeAddedSummary(
  candidate: PeriodSummary,
  current: PeriodSummary | null,
) {
  if (current == null || current.periodId !== candidate.periodId)
    return { summary: candidate, adoptedCandidate: true };
  const base =
    candidate.plannedTotalYen > current.plannedTotalYen ? candidate : current;
  const other = base === candidate ? current : candidate;
  const recordedDates = new Set<string>();
  for (const row of other.dailyRows) {
    if (row.isRecorded) recordedDates.add(row.date);
  }
  let dailyRows: DailyRow[] | undefined;
  for (let index = 0; index < base.dailyRows.length; index++) {
    const row = base.dailyRows[index];
    if (row.isRecorded || !recordedDates.has(row.date)) continue;
    dailyRows ??= base.dailyRows.slice();
    dailyRows[index] = { ...row, isRecorded: true };
  }
  // A zero-yen recording may be adopted while retaining equivalent totals.
  const adoptedCandidate =
    base === candidate ||
    (dailyRows !== undefined &&
      candidate.plannedTotalYen === base.plannedTotalYen &&
      candidate.dailyRows.length === base.dailyRows.length &&
      candidate.dailyRows.every(
        (row, index) =>
          row.date === base.dailyRows[index].date &&
          row.usedYen === base.dailyRows[index].usedYen,
      ));
  return {
    summary: dailyRows ? { ...base, dailyRows } : base,
    adoptedCandidate,
  };
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
