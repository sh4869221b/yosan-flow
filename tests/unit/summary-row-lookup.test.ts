import { expect, it } from "vitest";
import { getModalRemainingRows } from "#lib/dashboard/modal-preview.ts";
import { findSummaryRow } from "#lib/dashboard/summary-rows.ts";
import { createSummary } from "./day-entry-controller-test-fixtures";

it("looks up an exact date and counts remaining rows from the first matching or later date", () => {
  const summary = createSummary(100);
  const [first, last] = summary.dailyRows;
  summary.endDate = "2026-07-14";
  last.date = summary.endDate;

  for (const [date, expectedRow, remaining] of [
    [null, null, 0],
    ["2026-07-11", null, 2],
    [first.date, first, 2],
    ["2026-07-13", null, 1],
    [last.date, last, 1],
    ["2026-07-15", null, 0],
  ] as const) {
    expect(findSummaryRow(summary, date)).toBe(expectedRow);
    expect(getModalRemainingRows(summary, date)).toBe(remaining);
  }

  const empty = { ...summary, dailyRows: [] };
  expect(findSummaryRow(empty, first.date)).toBeNull();
  expect(getModalRemainingRows(empty, first.date)).toBe(0);
});
