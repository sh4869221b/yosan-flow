import { Effect } from "effect";
import { periodSummaryUrl } from "$lib/dashboard/api-urls";
import type { PeriodSummary } from "$lib/dashboard/controller-types";
import { fetchJsonEffect } from "$lib/dashboard/fetch-json";
import type { PeriodSummaryRevision } from "$lib/dashboard/period-summary-revision";

type Dependencies = {
  readonly applySummary: (_summary: PeriodSummary) => void;
  readonly getMutationSequence: () => number;
  readonly getSelectedDate: () => string | null;
  readonly getSelectedPeriodId: () => string | null;
  readonly loadHistoryEffect: (_date: string) => Effect.Effect<void, never>;
  readonly setError: (_error: string) => void;
  readonly summaryRevision: PeriodSummaryRevision;
};

export function createHistorySummaryReconciliation(dependencies: Dependencies) {
  function ownsSelection(
    periodId: string,
    date: string,
    sequence: number,
  ): boolean {
    return (
      sequence === dependencies.getMutationSequence() &&
      dependencies.getSelectedPeriodId() === periodId &&
      dependencies.getSelectedDate() === date
    );
  }

  return (
    periodId: string,
    date: string,
    mutationSequence: number,
  ): Effect.Effect<void, never> => {
    const reconciliationRevision = dependencies.summaryRevision.get(periodId);
    const reconciliationMutation =
      dependencies.summaryRevision.getMutationSequence(periodId);
    return Effect.gen(function* () {
      const result = yield* fetchJsonEffect<PeriodSummary>(
        periodSummaryUrl(periodId),
        undefined,
        "再取得に失敗しました。",
      ).pipe(Effect.either);
      const reconciliationIsCurrent =
        mutationSequence === dependencies.getMutationSequence() &&
        dependencies.getSelectedPeriodId() === periodId &&
        dependencies.summaryRevision.getMutationSequence(periodId) ===
          reconciliationMutation &&
        dependencies.summaryRevision.get(periodId) === reconciliationRevision;
      if (
        result._tag === "Right" &&
        reconciliationIsCurrent &&
        result.right.periodId === periodId
      ) {
        dependencies.applySummary(result.right);
      }
      if (ownsSelection(periodId, date, mutationSequence)) {
        yield* dependencies.loadHistoryEffect(date);
        if (
          result._tag === "Left" &&
          ownsSelection(periodId, date, mutationSequence)
        ) {
          dependencies.setError(result.left);
        }
      }
    });
  };
}
