import type {
  DailyRow,
  PeriodSummary,
} from "#lib/dashboard/controller-types.ts";
import {
  findSummaryRow,
  firstRowIndexOnOrAfter,
} from "#lib/dashboard/summary-rows.ts";

export function getModalPreview(
  summary: PeriodSummary | null,
  selectedRow: DailyRow | null,
  inputValue: number | null,
  mode: "add" | "overwrite",
) {
  const current = selectedRow?.usedYen ?? 0;
  if (inputValue == null)
    return {
      afterYen: current,
      remainingYen: summary?.remainingYen ?? null,
      error: null,
    };

  const base = mode === "add" ? current : 0;
  if (inputValue > Number.MAX_SAFE_INTEGER - base)
    return {
      afterYen: null,
      remainingYen: null,
      error: "日計が扱える金額の上限を超えます。",
    };

  const afterYen = base + inputValue;
  if (summary == null) return { afterYen, remainingYen: null, error: null };

  const included =
    findSummaryRow(summary, selectedRow?.date ?? null)?.usedYen ?? 0;
  const otherDays = summary.plannedTotalYen - included;
  if (afterYen > Number.MAX_SAFE_INTEGER - otherDays)
    return {
      afterYen: null,
      remainingYen: null,
      error: "期間合計が扱える金額の上限を超えます。",
    };

  return {
    afterYen,
    remainingYen: summary.budgetYen - (otherDays + afterYen),
    error: null,
  };
}

export function getModalRemainingRows(
  summary: PeriodSummary | null,
  selectedDate: string | null,
): number {
  if (summary == null || selectedDate == null) {
    return 0;
  }
  const rows = summary.dailyRows;
  return rows.length - firstRowIndexOnOrAfter(rows, selectedDate);
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
