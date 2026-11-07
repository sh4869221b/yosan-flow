import { describe, expect, it } from "vitest";
import {
  mergeAddedSummary,
  summarySpendingMatches,
} from "#lib/dashboard/summary-rows.ts";
import { createSummary } from "./day-entry-controller-test-fixtures";

describe("merging add-only summary snapshots", () => {
  it("retains zero recordings from either response alongside the greatest amount", () => {
    const initial = createSummary(0);
    const zero = {
      ...initial,
      dailyRows: initial.dailyRows.map((row, index) => ({
        ...row,
        isRecorded: index === 0,
      })),
    };
    const positive = createSummary(0, 500);
    for (const [first, second] of [
      [zero, positive],
      [positive, zero],
    ] as const) {
      const merged = mergeAddedSummary(second, first);
      expect(merged.plannedTotalYen).toBe(500);
      expect(merged.dailyRows.map((row) => row.isRecorded)).toEqual([
        true,
        true,
      ]);
    }
    expect(summarySpendingMatches(zero, initial)).toBe(false);
  });
});

it("retains both recorded dates from out-of-order concurrent zero saves", async () => {
  const { createDayEntrySubmissionTracker } =
    await import("#lib/dashboard/day-entry-submission-tracker.ts");
  const { createPeriodSummaryRevision } =
    await import("#lib/dashboard/period-summary-revision.ts");
  const tracker = createDayEntrySubmissionTracker(
    createPeriodSummaryRevision(),
  );
  const initial = createSummary(0);
  const first = {
    ...initial,
    dailyRows: initial.dailyRows.map((row, index) => ({
      ...row,
      isRecorded: index === 0,
    })),
  };
  const second = {
    ...initial,
    dailyRows: initial.dailyRows.map((row, index) => ({
      ...row,
      isRecorded: index === 1,
    })),
  };
  for (const [a, b] of [
    [first, second],
    [second, first],
  ] as const) {
    tracker.clearBest(initial.periodId);
    tracker.accept(initial.periodId, a, 0, 0);
    tracker.accept(initial.periodId, b, 0, 0);
    expect(
      tracker
        .getBest(initial.periodId, 0)
        ?.dailyRows.map((row) => row.isRecorded),
    ).toEqual([true, true]);
  }
});
