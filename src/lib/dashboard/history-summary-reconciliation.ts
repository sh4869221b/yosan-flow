import { Effect } from "effect";
import { periodSummaryUrl } from "$lib/dashboard/api-urls";
import type { PeriodSummary } from "$lib/dashboard/controller-types";
import { fetchJsonEffect } from "$lib/dashboard/fetch-json";
import type { PeriodSummaryRevision } from "$lib/dashboard/period-summary-revision";

type Dependencies = {
  readonly applySummary: (_summary: PeriodSummary) => void;
  readonly getMutationSequence: (_periodId: string) => number;
  readonly getSelectedDate: () => string | null;
  readonly getSelectedPeriodId: () => string | null;
  readonly loadHistoryEffect: (_date: string) => Effect.Effect<void, never>;
  readonly setError: (_error: string) => void;
  readonly summaryRevision: PeriodSummaryRevision;
};

type ReconciliationRequest = {
  readonly date: string;
  readonly mutationSequence: number;
  readonly originatingError: string | undefined;
  readonly periodId: string;
};

export function createHistorySummaryReconciliation(dependencies: Dependencies) {
  function ownsSelection(
    periodId: string,
    date: string,
    sequence: number,
  ): boolean {
    return (
      sequence === dependencies.getMutationSequence(periodId) &&
      dependencies.getSelectedPeriodId() === periodId &&
      dependencies.getSelectedDate() === date
    );
  }

  function recoverHistories(
    request: ReconciliationRequest,
    reconciliationError?: string,
  ): Effect.Effect<void, never> {
    const { date, mutationSequence, originatingError, periodId } = request;
    if (!ownsSelection(periodId, date, mutationSequence)) {
      return Effect.void;
    }
    if (dependencies.summaryRevision.isMutationActive(periodId)) {
      const activeMutation =
        dependencies.summaryRevision.getMutationSequence(periodId);
      return dependencies.summaryRevision
        .awaitMutationSettlement(periodId, activeMutation)
        .pipe(
          Effect.andThen(
            Effect.suspend(() =>
              recoverHistories(request, reconciliationError),
            ),
          ),
        );
    }
    return dependencies.loadHistoryEffect(date).pipe(
      Effect.andThen(
        Effect.sync(() => {
          if (!ownsSelection(periodId, date, mutationSequence)) return;
          if (originatingError != null) {
            dependencies.setError(originatingError);
          } else if (reconciliationError != null) {
            dependencies.setError(reconciliationError);
          }
        }),
      ),
    );
  }

  return (request: ReconciliationRequest): Effect.Effect<void, never> => {
    const { periodId } = request;
    if (dependencies.summaryRevision.isMutationActive(periodId)) {
      return recoverHistories(request);
    }
    const reconciliationRevision = dependencies.summaryRevision.get(periodId);
    const reconciliationMutation =
      dependencies.summaryRevision.getMutationSequence(periodId);
    return Effect.gen(function* () {
      const result = yield* fetchJsonEffect<PeriodSummary>(
        periodSummaryUrl(periodId),
        undefined,
        "再取得に失敗しました。",
      ).pipe(Effect.either);
      const summaryReconciliationIsCurrent =
        dependencies.getSelectedPeriodId() === periodId &&
        dependencies.summaryRevision.getMutationSequence(periodId) ===
          reconciliationMutation &&
        dependencies.summaryRevision.get(periodId) === reconciliationRevision;
      if (
        result._tag === "Right" &&
        summaryReconciliationIsCurrent &&
        result.right.periodId === periodId
      ) {
        dependencies.applySummary(result.right);
      }
      yield* recoverHistories(
        request,
        result._tag === "Left" ? result.left : undefined,
      );
    });
  };
}
