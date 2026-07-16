import { Effect } from "effect";
import { periodSummaryUrl } from "$lib/dashboard/api-urls";
import type { DailyRow, PeriodSummary } from "$lib/dashboard/controller-types";
import type { createDayEntrySubmissionTracker } from "$lib/dashboard/day-entry-submission-tracker";
import { fetchJsonEffect } from "$lib/dashboard/fetch-json";
import type { PeriodSummaryRevision } from "$lib/dashboard/period-summary-revision";
import { findSummaryRow } from "$lib/dashboard/summary-rows";

type Dependencies = {
  readonly getHistoryMutationSequence: (_periodId: string) => number;
  readonly getSelectedDate: () => string | null;
  readonly getSelectedPeriodId: () => string | null;
  readonly setSelectedRow: (_row: DailyRow | null) => void;
  readonly setSummary: (_summary: PeriodSummary) => void;
  readonly submissionTracker: ReturnType<
    typeof createDayEntrySubmissionTracker
  >;
  readonly summaryRevision: PeriodSummaryRevision;
};

export function createDayEntrySummaryReconciliation(
  dependencies: Dependencies,
) {
  const latestRefreshSequences = new Map<string, number>();
  let refreshSequence = 0;

  return (
    periodId: string,
    submittedDate: string,
  ): Effect.Effect<void, never> =>
    Effect.gen(function* () {
      const currentRefreshSequence = ++refreshSequence;
      const refreshSummaryRevision = dependencies.summaryRevision.get(periodId);
      const refreshSummaryMutation =
        dependencies.summaryRevision.getMutationSequence(periodId);
      latestRefreshSequences.set(periodId, currentRefreshSequence);
      const refreshMutationSequence =
        dependencies.getHistoryMutationSequence(periodId);
      const result = yield* fetchJsonEffect<PeriodSummary>(
        periodSummaryUrl(periodId),
        undefined,
        "再取得に失敗しました。",
      ).pipe(Effect.either);
      const refreshIsCurrent =
        latestRefreshSequences.get(periodId) === currentRefreshSequence &&
        !dependencies.submissionTracker.hasActive(periodId) &&
        dependencies.getHistoryMutationSequence(periodId) ===
          refreshMutationSequence &&
        dependencies.summaryRevision.getMutationSequence(periodId) ===
          refreshSummaryMutation &&
        dependencies.summaryRevision.get(periodId) === refreshSummaryRevision &&
        dependencies.getSelectedPeriodId() === periodId;
      if (
        result._tag === "Right" &&
        refreshIsCurrent &&
        result.right.periodId === periodId
      ) {
        dependencies.summaryRevision.publish(
          result.right,
          dependencies.setSummary,
        );
        if (dependencies.getSelectedDate() === submittedDate) {
          dependencies.setSelectedRow(
            findSummaryRow(result.right, submittedDate),
          );
        }
      }
    });
}
