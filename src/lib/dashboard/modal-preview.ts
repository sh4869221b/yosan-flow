import { parseNonNegativeIntegerYenInput } from "$lib/dashboard/yen-input";
import type { DailyRow, PeriodSummary } from "$lib/dashboard/controller-types";

export function getModalPreviewAfterYen(
  selectedRow: DailyRow | null,
  modalInputYen: string,
): number {
  return (
    (selectedRow?.usedYen ?? 0) +
    (parseNonNegativeIntegerYenInput(modalInputYen) ?? 0)
  );
}

export function getModalRemainingRows(
  summary: PeriodSummary | null,
  selectedDate: string | null,
): number {
  if (summary == null || selectedDate == null) {
    return 0;
  }
  return summary.dailyRows.filter((row) => row.date >= selectedDate).length;
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
