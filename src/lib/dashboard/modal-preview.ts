import type {
  DailyRow,
  PeriodSummary,
} from "#lib/dashboard/controller-types.ts";

export function getModalPreviewAfterYen(
  selectedRow: DailyRow | null,
  inputValue: number | null,
): number {
  return (selectedRow?.usedYen ?? 0) + (inputValue ?? 0);
}

export function getModalRemainingRows(
  summary: PeriodSummary | null,
  selectedDate: string | null,
): number {
  if (summary == null || selectedDate == null) {
    return 0;
  }
  let remainingRows = 0;
  for (const row of summary.dailyRows) {
    if (row.date >= selectedDate) remainingRows++;
  }
  return remainingRows;
}

export function getModalPreviewRemainingYen(
  summary: PeriodSummary | null,
  selectedRow: DailyRow | null,
  previewAfterYen: number,
): number | null {
  if (summary == null) {
    return null;
  }
  return summary.remainingYen + (selectedRow?.usedYen ?? 0) - previewAfterYen;
}

export function getModalPreviewRecommendedYen(
  previewRemainingYen: number | null,
  remainingRows: number,
): number | null {
  if (previewRemainingYen == null || remainingRows === 0) {
    return null;
  }
  return Math.max(0, Math.floor(previewRemainingYen / remainingRows));
}
