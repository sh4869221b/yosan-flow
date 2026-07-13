import { Effect } from "effect";
import { periodSummaryUrl } from "$lib/dashboard/api-urls";
import type { PeriodSummary } from "$lib/dashboard/controller-types";
import { fetchJsonEffect } from "$lib/dashboard/fetch-json";
import type { createPeriodSummaryRequestTracker } from "$lib/dashboard/period-summary-request-tracker";
import type { PeriodSummaryRevision } from "$lib/dashboard/period-summary-revision";
import { summarySpendingMatches } from "$lib/dashboard/summary-rows";
import type { SavePeriodPayload } from "$lib/dashboard/types";

type Dependencies = {
  readonly getSelectedPeriodId: () => string | null;
  readonly getSummary: () => PeriodSummary | null;
  readonly getSummaryLoading: () => boolean;
  readonly publishSummary: (_summary: PeriodSummary) => void;
  readonly refreshPeriodListEffect: (
    _periodId: string,
    _reportSummaryError?: boolean,
  ) => Effect.Effect<void, string>;
  readonly refreshSummaryEffect: (
    _periodId: string,
    _reportError?: boolean,
  ) => Effect.Effect<void, never>;
  readonly setError: (_error: string | null) => void;
  readonly setSaving: (_saving: boolean) => void;
  readonly summaryRequests: ReturnType<
    typeof createPeriodSummaryRequestTracker
  >;
  readonly summaryRevision: PeriodSummaryRevision;
};

export function createPeriodUpdateEffect(dependencies: Dependencies) {
  let saveSequence = 0;

  return (payload: SavePeriodPayload): Effect.Effect<void, never> => {
    const periodId = dependencies.getSelectedPeriodId();
    if (periodId == null || dependencies.getSummaryLoading()) {
      return Effect.void;
    }
    const currentSaveSequence = ++saveSequence;
    return Effect.gen(function* () {
      dependencies.setSaving(true);
      dependencies.setError(null);
      const request = dependencies.summaryRequests.start(periodId);
      const outcome = yield* dependencies.summaryRevision
        .withMutationSlot(
          periodId,
          "period",
          Effect.gen(function* () {
            const summaryMutation =
              dependencies.summaryRevision.beginMutation(periodId);
            const result = yield* fetchJsonEffect<PeriodSummary>(
              periodSummaryUrl(periodId),
              {
                body: JSON.stringify(payload),
                headers: { "content-type": "application/json" },
                method: "PUT",
              },
              "保存に失敗しました。",
            ).pipe(
              Effect.either,
              Effect.ensuring(
                Effect.sync(() =>
                  dependencies.summaryRevision.completeMutation(
                    periodId,
                    summaryMutation,
                  ),
                ),
              ),
            );
            const mutationIsFresh =
              dependencies.summaryRevision.isMutationFresh(
                periodId,
                summaryMutation,
              );
            if (!dependencies.summaryRequests.owns(request)) {
              return { mutationIsFresh, request, result };
            }
            if (
              result._tag === "Right" &&
              dependencies.getSelectedPeriodId() === periodId &&
              result.right.periodId === periodId &&
              (mutationIsFresh ||
                summarySpendingMatches(result.right, dependencies.getSummary()))
            ) {
              dependencies.publishSummary(result.right);
            }
            return { mutationIsFresh, request, result };
          }),
        )
        .pipe(
          Effect.ensuring(
            Effect.sync(() => {
              if (currentSaveSequence === saveSequence) {
                dependencies.setSaving(false);
              }
            }),
          ),
        );
      if (
        !dependencies.summaryRequests.owns(outcome.request) ||
        dependencies.getSelectedPeriodId() !== periodId
      ) {
        return;
      }
      if (outcome.result._tag === "Left") {
        dependencies.setError(outcome.result.left);
      }
      const reconciliationRevision = dependencies.summaryRevision.get(periodId);
      const reportReconciliationError = outcome.result._tag === "Right";
      const refreshResult = yield* dependencies
        .refreshPeriodListEffect(periodId, reportReconciliationError)
        .pipe(Effect.either);
      if (refreshResult._tag === "Left") {
        if (reportReconciliationError) {
          dependencies.setError(refreshResult.left);
        }
        yield* dependencies.refreshSummaryEffect(
          periodId,
          reportReconciliationError,
        );
      } else if (
        !outcome.mutationIsFresh &&
        dependencies.summaryRevision.get(periodId) === reconciliationRevision
      ) {
        yield* dependencies.refreshSummaryEffect(periodId);
      }
    });
  };
}
