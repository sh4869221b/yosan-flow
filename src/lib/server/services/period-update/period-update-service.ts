import { Effect } from "effect";
import {
  LinkedPeriodBoundaryConflictError,
  type BudgetPeriodRecord,
  type BudgetPeriodRepository,
} from "$lib/server/db/budget-period-repository";
import { PeriodNotFoundError } from "$lib/server/db/budget-period-types";
import { decidePeriodBoundaryUpdate } from "$lib/server/services/period-update/period-boundary-decision";
import { toEffectError } from "$lib/server/effect/runtime";
import { assertValidPeriodInput } from "$lib/server/db/budget-period-validation-coordinator";
import {
  PeriodUpdateConflictError,
  type PeriodBoundaryAfter,
  type PeriodBoundaryUpdateProposal,
  type PeriodSnapshot,
  type PeriodUpdateRequest,
} from "$lib/server/services/period-update/period-update-types";

export type PeriodUpdateServiceResult =
  | { readonly kind: "updated"; readonly period: BudgetPeriodRecord }
  | {
      readonly kind: "confirmation-required";
      readonly proposal: PeriodBoundaryUpdateProposal;
    };

export type PeriodUpdateServiceDependencies = {
  readonly budgetPeriodRepository: BudgetPeriodRepository;
  readonly updateOrdinary: (input: {
    readonly id: string;
    readonly startDate: string;
    readonly endDate: string;
    readonly budgetYen: number;
  }) => Effect.Effect<BudgetPeriodRecord, Error>;
  readonly assertNoOutOfRangeEntries: (
    periodId: string,
    startDate: string,
    endDate: string,
  ) => Effect.Effect<void, Error>;
  readonly nowIso: () => string;
};

function snapshotsMatch(left: PeriodSnapshot, right: PeriodSnapshot): boolean {
  return (
    left.id === right.id &&
    left.startDate === right.startDate &&
    left.endDate === right.endDate &&
    left.budgetYen === right.budgetYen &&
    left.status === right.status &&
    left.predecessorPeriodId === right.predecessorPeriodId &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt
  );
}

function afterValuesMatch(
  left: PeriodBoundaryAfter,
  right: PeriodBoundaryAfter,
): boolean {
  return (
    left.id === right.id &&
    left.startDate === right.startDate &&
    left.endDate === right.endDate &&
    left.budgetYen === right.budgetYen
  );
}

function proposalsMatch(
  left: PeriodBoundaryUpdateProposal,
  right: PeriodBoundaryUpdateProposal,
): boolean {
  return (
    left.version === right.version &&
    snapshotsMatch(left.target.before, right.target.before) &&
    afterValuesMatch(left.target.after, right.target.after) &&
    snapshotsMatch(left.successor.before, right.successor.before) &&
    afterValuesMatch(left.successor.after, right.successor.after)
  );
}

function confirmationConflict(): Effect.Effect<never, Error> {
  return Effect.fail(new PeriodUpdateConflictError());
}

export function createPeriodUpdateService(
  dependencies: PeriodUpdateServiceDependencies,
): (
  periodId: string,
  request: PeriodUpdateRequest,
) => Effect.Effect<PeriodUpdateServiceResult, Error> {
  return (periodId, request) =>
    Effect.gen(function* () {
      const target =
        yield* dependencies.budgetPeriodRepository.findById(periodId);
      if (!target) {
        return yield* Effect.fail(new PeriodNotFoundError(periodId));
      }
      const successors =
        yield* dependencies.budgetPeriodRepository.findSuccessorsByPredecessorId(
          periodId,
        );

      const confirmation = request.confirmation;
      if (confirmation !== undefined) {
        const decision = yield* Effect.try({
          try: () =>
            decidePeriodBoundaryUpdate({
              target,
              successors,
              requested: request,
            }),
          catch: () => new PeriodUpdateConflictError(),
        });
        switch (decision.kind) {
          case "ordinary-update":
            return yield* confirmationConflict();
          case "confirmation-required": {
            if (!proposalsMatch(decision.proposal, confirmation)) {
              return yield* confirmationConflict();
            }
            const result = yield* dependencies.budgetPeriodRepository
              .updateLinkedBoundary({
                target: decision.proposal.target,
                successor: decision.proposal.successor,
                nowIso: dependencies.nowIso(),
              })
              .pipe(
                Effect.catchIf(
                  (error) => error instanceof LinkedPeriodBoundaryConflictError,
                  () => confirmationConflict(),
                ),
              );
            return { kind: "updated", period: result.target };
          }
        }
      }

      const decision = yield* Effect.try({
        try: () => {
          assertValidPeriodInput(
            request.startDate,
            request.endDate,
            request.budgetYen,
          );
          return decidePeriodBoundaryUpdate({
            target,
            successors,
            requested: request,
          });
        },
        catch: toEffectError,
      });
      switch (decision.kind) {
        case "ordinary-update": {
          const period = yield* dependencies.updateOrdinary({
            id: periodId,
            startDate: request.startDate,
            endDate: request.endDate,
            budgetYen: request.budgetYen,
          });
          return { kind: "updated", period };
        }
        case "confirmation-required":
          yield* dependencies.assertNoOutOfRangeEntries(
            decision.proposal.target.after.id,
            decision.proposal.target.after.startDate,
            decision.proposal.target.after.endDate,
          );
          yield* dependencies.assertNoOutOfRangeEntries(
            decision.proposal.successor.after.id,
            decision.proposal.successor.after.startDate,
            decision.proposal.successor.after.endDate,
          );
          return decision;
      }
    });
}
