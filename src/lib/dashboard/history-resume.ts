import { Effect } from "effect";
import type { PeriodSummaryRevision } from "#lib/dashboard/period-summary-revision.ts";

type Dependencies = {
  readonly getSelectedDate: () => string | null;
  readonly getSelectedPeriodId: () => string | null;
  readonly getSessionGeneration: () => number;
  readonly getRequestSequence: () => number;
  readonly getModalOpen: () => boolean;
  readonly loadHistoryEffect: (
    _date: string,
    _isCurrent: () => boolean,
  ) => Effect.Effect<void, never>;
  readonly summaryRevision: PeriodSummaryRevision;
};

export function createHistoryResumeEffect(dependencies: Dependencies) {
  return (): Effect.Effect<void, never> => {
    const periodId = dependencies.getSelectedPeriodId();
    const date = dependencies.getSelectedDate();
    if (periodId == null || date == null) return Effect.void;
    const request = {
      periodId,
      date,
      generation: dependencies.getSessionGeneration(),
      sequence: dependencies.getRequestSequence(),
    };

    const ownsSession = () =>
      dependencies.getModalOpen() &&
      dependencies.getSelectedPeriodId() === request.periodId &&
      dependencies.getSelectedDate() === request.date &&
      dependencies.getSessionGeneration() === request.generation;

    function refresh(): Effect.Effect<void, never> {
      return Effect.suspend(() => {
        if (
          !ownsSession() ||
          dependencies.getRequestSequence() !== request.sequence
        )
          return Effect.void;
        if (dependencies.summaryRevision.isMutationActive(request.periodId)) {
          const mutation = dependencies.summaryRevision.getMutationSequence(
            request.periodId,
          );
          return dependencies.summaryRevision
            .awaitMutationSettlement(request.periodId, mutation)
            .pipe(Effect.andThen(refresh));
        }
        return dependencies.loadHistoryEffect(request.date, ownsSession);
      });
    }

    return refresh();
  };
}
