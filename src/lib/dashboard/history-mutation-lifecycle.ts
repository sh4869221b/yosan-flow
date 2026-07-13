import { Effect } from "effect";
import { historyItemUrl } from "$lib/dashboard/api-urls";
import type { PeriodSummary } from "$lib/dashboard/controller-types";
import { fetchJsonEffect } from "$lib/dashboard/fetch-json";
import { createHistoryMutationTracker } from "$lib/dashboard/history-mutation-tracker";
import { createHistorySummaryReconciliation } from "$lib/dashboard/history-summary-reconciliation";
import type { PeriodSummaryRevision } from "$lib/dashboard/period-summary-revision";
import { summaryConfigurationMatches } from "$lib/dashboard/summary-rows";
import type { HistoryMutationResponse } from "$lib/dashboard/types";

type Dependencies = {
  readonly applyHistories: (
    _body: HistoryMutationResponse<PeriodSummary>,
  ) => void;
  readonly applySummary: (_summary: PeriodSummary) => void;
  readonly bumpVersion: () => void;
  readonly getSelectedDate: () => string | null;
  readonly getSelectedPeriodId: () => string | null;
  readonly getSummary: () => PeriodSummary | null;
  readonly invalidateHistoryLoads: (_periodId: string, _date: string) => void;
  readonly loadHistoryEffect: (_date: string) => Effect.Effect<void, never>;
  readonly setError: (_error: string | null) => void;
  readonly summaryRevision: PeriodSummaryRevision;
};

export function createHistoryMutationLifecycle(dependencies: Dependencies) {
  const historyMutations = createHistoryMutationTracker(dependencies);
  const reconcileHistoryMutationEffect = createHistorySummaryReconciliation({
    applySummary: dependencies.applySummary,
    getMutationSequence: historyMutations.getSequence,
    getSelectedDate: dependencies.getSelectedDate,
    getSelectedPeriodId: dependencies.getSelectedPeriodId,
    loadHistoryEffect: dependencies.loadHistoryEffect,
    setError: dependencies.setError,
    summaryRevision: dependencies.summaryRevision,
  });

  function mutateEffect(
    historyId: string,
    request: RequestInit,
    errorMessage: string,
  ): Effect.Effect<void, never> {
    const selectedPeriodId = dependencies.getSelectedPeriodId();
    const selectedDate = dependencies.getSelectedDate();
    if (selectedPeriodId == null || selectedDate == null) return Effect.void;
    const mutationReservation = historyMutations.reserve(
      selectedPeriodId,
      selectedDate,
      historyId,
    );
    if (mutationReservation == null) return Effect.void;
    dependencies.setError(null);
    dependencies.bumpVersion();
    return Effect.gen(function* () {
      const outcome = yield* dependencies.summaryRevision
        .withMutationSlot(
          selectedPeriodId,
          "history",
          Effect.gen(function* () {
            const mutationSequence = historyMutations.activate(
              selectedPeriodId,
              mutationReservation,
            );
            if (mutationSequence == null) return;
            dependencies.invalidateHistoryLoads(selectedPeriodId, selectedDate);
            const summaryMutation =
              dependencies.summaryRevision.beginMutation(selectedPeriodId);
            const mutationSummaryRevision =
              dependencies.summaryRevision.get(selectedPeriodId);
            const result = yield* fetchJsonEffect<
              HistoryMutationResponse<PeriodSummary>
            >(
              historyItemUrl(selectedPeriodId, selectedDate, historyId),
              request,
              errorMessage,
            ).pipe(
              Effect.either,
              Effect.ensuring(
                Effect.sync(() =>
                  dependencies.summaryRevision.completeMutation(
                    selectedPeriodId,
                    summaryMutation,
                  ),
                ),
              ),
            );
            const mutationOwnsCurrentPeriod = historyMutations.ownsPeriod(
              selectedPeriodId,
              mutationSequence,
            );
            const mutationOwnsSummary =
              mutationOwnsCurrentPeriod &&
              dependencies.summaryRevision.isMutationFresh(
                selectedPeriodId,
                summaryMutation,
              );
            const mutationOwnsCurrentDate = historyMutations.ownsSelection(
              selectedPeriodId,
              selectedDate,
              mutationSequence,
            );
            if (result._tag === "Left" && mutationOwnsCurrentDate) {
              dependencies.setError(result.left);
            }
            let shouldReconcile = true;
            if (
              result._tag === "Right" &&
              mutationOwnsCurrentPeriod &&
              result.right.summary.periodId === selectedPeriodId
            ) {
              const summaryIsCompatible = summaryConfigurationMatches(
                result.right.summary,
                dependencies.getSummary(),
              );
              const mustReconcile =
                !mutationOwnsSummary ||
                dependencies.summaryRevision.get(selectedPeriodId) !==
                  mutationSummaryRevision ||
                !summaryIsCompatible;
              shouldReconcile = mustReconcile;
              if (!mustReconcile && summaryIsCompatible) {
                dependencies.applySummary(result.right.summary);
                if (mutationOwnsCurrentDate) {
                  dependencies.applyHistories(result.right);
                }
              }
            }
            return {
              mutationError: result._tag === "Left" ? result.left : undefined,
              mutationSequence,
              shouldReconcile,
            };
          }),
        )
        .pipe(
          Effect.ensuring(
            Effect.sync(() => {
              historyMutations.finish(selectedPeriodId, mutationReservation);
              dependencies.bumpVersion();
            }),
          ),
        );
      if (outcome?.shouldReconcile) {
        yield* reconcileHistoryMutationEffect({
          date: selectedDate,
          mutationSequence: outcome.mutationSequence,
          originatingError: outcome.mutationError,
          periodId: selectedPeriodId,
        });
      }
    });
  }

  return {
    getSequence: historyMutations.getSequence,
    getVisibleId: historyMutations.getVisibleId,
    mutateEffect,
  };
}
