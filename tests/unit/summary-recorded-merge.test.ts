import { describe, expect, it } from "vitest";
import { createDayEntrySubmissionTracker } from "#lib/dashboard/day-entry-submission-tracker.ts";
import { createPeriodSummaryRevision } from "#lib/dashboard/period-summary-revision.ts";
import {
  mergeAddedSummary,
  summarySpendingMatches,
} from "#lib/dashboard/summary-rows.ts";
import { createSummary } from "./day-entry-controller-test-fixtures";

describe("merging add-only summary snapshots", () => {
  it("reuses the base summary when it already contains all recordings", () => {
    const current = createSummary(0, 500);
    const candidate = createSummary(0, 300);

    expect(mergeAddedSummary(candidate, current)).toBe(current);
  });

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

it("retains both recorded dates from out-of-order concurrent zero saves", () => {
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
        ?.summary.dailyRows.map((row) => row.isRecorded),
    ).toEqual([true, true]);
  }
});

it("discards a cached acknowledgement when a subsequent response differs from the provisional merge", () => {
  const tracker = createDayEntrySubmissionTracker(
    createPeriodSummaryRevision(),
  );
  const first = createSummary(300);
  const latest = { ...first, daysRemaining: first.daysRemaining - 1 };
  const firstAcknowledgement = () => undefined;
  tracker.accept(first.periodId, first, 0, 0, firstAcknowledgement);
  expect(tracker.getBest(first.periodId, 0)?.acceptSummaries).toEqual([
    firstAcknowledgement,
  ]);

  tracker.accept(first.periodId, latest, 0, 0, () => undefined);
  expect(tracker.getBest(first.periodId, 0)?.summary).toBe(first);
  expect(tracker.getBest(first.periodId, 0)?.acceptSummaries).toEqual([]);
});
