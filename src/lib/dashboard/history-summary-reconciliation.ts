import { Effect } from "effect";
import { periodSummaryUrl } from "$lib/dashboard/api-urls";
import type { PeriodSummary } from "$lib/dashboard/controller-types";
import { fetchJsonEffect } from "$lib/dashboard/fetch-json";
import type { PeriodSummaryRevision } from "$lib/dashboard/period-summary-revision";
import type { HistoryActionResult } from "$lib/dashboard/types";

type Dependencies = {
  readonly applySummary: (_summary: PeriodSummary) => void;
  readonly getMutationSequence: (_periodId: string) => number;
  readonly getSelectedDate: () => string | null;
  readonly getSelectedPeriodId: () => string | null;
  readonly loadHistoryEffect: (
    _date: string,
  ) => Effect.Effect<HistoryActionResult, never>;
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
  ): Effect.Effect<HistoryActionResult, never> {
    const { date, mutationSequence, originatingError, periodId } = request;
    if (!ownsSelection(periodId, date, mutationSequence)) {
      return Effect.succeed({ kind: "ignored" });
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
    return Effect.gen(function* () {
      const loadResult = yield* dependencies.loadHistoryEffect(date);
      if (!ownsSelection(periodId, date, mutationSequence)) {
        return { kind: "ignored" } as const;
      }
      if (originatingError != null) {
        dependencies.setError(originatingError);
        return { kind: "failure", message: originatingError } as const;
      }
      if (reconciliationError != null) {
        dependencies.setError(reconciliationError);
        return { kind: "failure", message: reconciliationError } as const;
      }
      return loadResult;
    });
  }

  return (
    request: ReconciliationRequest,
  ): Effect.Effect<HistoryActionResult, never> => {
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
      const summaryWasApplied =
        result._tag === "Right" &&
        summaryReconciliationIsCurrent &&
        result.right.periodId === periodId;
      if (summaryWasApplied && result._tag === "Right") {
        dependencies.applySummary(result.right);
      }
      const recoveryResult = yield* recoverHistories(
        request,
        result._tag === "Left" ? result.left : undefined,
      );
      if (recoveryResult.kind !== "success") return recoveryResult;
      return summaryWasApplied
        ? ({ kind: "success" } as const)
        : ({ kind: "ignored" } as const);
    });
  };
}
