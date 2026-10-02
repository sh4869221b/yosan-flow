import { Effect } from "effect";
import { historyItemUrl } from "$lib/dashboard/api-urls";
import type { PeriodSummary } from "$lib/dashboard/controller-types";
import { fetchJsonEffect } from "$lib/dashboard/fetch-json";
import { createHistoryMutationTracker } from "$lib/dashboard/history-mutation-tracker";
import { createHistorySummaryReconciliation } from "$lib/dashboard/history-summary-reconciliation";
import type { PeriodSummaryRevision } from "$lib/dashboard/period-summary-revision";
import { summaryConfigurationMatches } from "$lib/dashboard/summary-rows";
import type {
  HistoryActionResult,
  HistoryMutationResponse,
} from "$lib/dashboard/types";

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
  readonly loadHistoryEffect: (
    _date: string,
  ) => Effect.Effect<HistoryActionResult, never>;
  readonly retainHistories: (
    _periodId: string,
    _date: string,
    _body: HistoryMutationResponse<PeriodSummary>,
    _revision: number,
    _mutationSequence: number,
  ) => void;
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

  type MutationContext = {
    readonly periodId: string;
    readonly date: string;
    readonly sequence: number;
    readonly summaryMutation: number;
    readonly summaryRevision: number;
    readonly ownsPeriod: boolean;
    readonly ownsDate: boolean;
    readonly ownsSummary: boolean;
  };

  function publishResponse(
    body: HistoryMutationResponse<PeriodSummary>,
    context: MutationContext,
  ): boolean {
    if (!context.ownsPeriod || body.summary.periodId !== context.periodId)
      return false;
    const summaryIsCompatible = summaryConfigurationMatches(
      body.summary,
      dependencies.getSummary(),
    );
    const mustReconcile =
      !context.ownsSummary ||
      dependencies.summaryRevision.get(context.periodId) !==
        context.summaryRevision ||
      !summaryIsCompatible;
    if (mustReconcile) return false;
    dependencies.applySummary(body.summary);
    if (context.ownsDate) dependencies.applyHistories(body);
    return true;
  }

  function retainResponse(
    body: HistoryMutationResponse<PeriodSummary>,
    context: MutationContext,
    responseWasPublished: boolean,
  ): void {
    const retainedRevision = dependencies.summaryRevision.get(context.periodId);
    if (
      !context.ownsDate &&
      historyMutations.getSequence(context.periodId) === context.sequence &&
      dependencies.summaryRevision.isMutationFresh(
        context.periodId,
        context.summaryMutation,
      ) &&
      retainedRevision ===
        context.summaryRevision + (responseWasPublished ? 1 : 0) &&
      summaryConfigurationMatches(body.summary, dependencies.getSummary()) &&
      body.summary.periodId === context.periodId
    ) {
      dependencies.retainHistories(
        context.periodId,
        context.date,
        body,
        retainedRevision,
        context.summaryMutation,
      );
    }
  }

  function mutateEffect(
    historyId: string,
    request: RequestInit,
    errorMessage: string,
  ): Effect.Effect<HistoryActionResult, never> {
    const selectedPeriodId = dependencies.getSelectedPeriodId();
    const selectedDate = dependencies.getSelectedDate();
    if (selectedPeriodId == null || selectedDate == null) {
      return Effect.succeed({ kind: "ignored" });
    }
    const mutationReservation = historyMutations.reserve(
      selectedPeriodId,
      selectedDate,
      historyId,
    );
    if (mutationReservation == null) {
      return Effect.succeed({ kind: "ignored" });
    }
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
            const context: MutationContext = {
              periodId: selectedPeriodId,
              date: selectedDate,
              sequence: mutationSequence,
              summaryMutation,
              summaryRevision: mutationSummaryRevision,
              ownsPeriod: mutationOwnsCurrentPeriod,
              ownsDate: mutationOwnsCurrentDate,
              ownsSummary: mutationOwnsSummary,
            };
            const responseWasPublished =
              result._tag === "Right" && publishResponse(result.right, context);
            if (result._tag === "Right")
              retainResponse(result.right, context, responseWasPublished);
            return {
              actionResult:
                result._tag === "Right" &&
                responseWasPublished &&
                mutationOwnsCurrentDate
                  ? ({ kind: "success" } as const)
                  : result._tag === "Left" && mutationOwnsCurrentDate
                    ? ({
                        kind: "failure",
                        message: result.left,
                      } as const)
                    : ({ kind: "ignored" } as const),
              mutationError: result._tag === "Left" ? result.left : undefined,
              mutationSequence,
              shouldReconcile: !responseWasPublished,
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
        return yield* reconcileHistoryMutationEffect({
          date: selectedDate,
          mutationSequence: outcome.mutationSequence,
          originatingError: outcome.mutationError,
          periodId: selectedPeriodId,
        });
      }
      return outcome?.actionResult ?? ({ kind: "ignored" } as const);
    });
  }

  return {
    getSequence: historyMutations.getSequence,
    getVisibleId: historyMutations.getVisibleId,
    mutateEffect,
  };
}
