import { Effect } from "effect";
import {
  noopTracing,
  type TracingAdapter,
} from "#lib/server/observability/tracing.ts";
import { withTracingEffect } from "#lib/server/observability/tracing-effect.ts";
import {
  LinkedPeriodBoundaryConflictError,
  type BudgetPeriodRecord,
  type BudgetPeriodRepository,
  type LinkedPeriodBoundaryUpdateCommand,
} from "#lib/server/db/budget-period-repository.ts";
import { PeriodNotFoundError } from "#lib/server/db/budget-period-types.ts";
import {
  decidePeriodBoundaryUpdate,
  getEarlierBoundaryPredecessorId,
} from "#lib/server/services/period-update/period-boundary-decision.ts";
import { toEffectError } from "#lib/server/effect/runtime.ts";
import {
  assertPeriodHasNoOverlap,
  assertPeriodPredecessorContinuity,
  assertPeriodSuccessorContinuity,
} from "#lib/server/db/budget-period-validation-coordinator.ts";
import {
  PeriodUpdateConflictError,
  type PeriodBoundaryAfter,
  type PeriodBoundaryUpdateProposal,
  type PeriodSnapshot,
  type PeriodUpdateRequest,
} from "#lib/server/services/period-update/period-update-types.ts";

export type PeriodUpdateServiceResult =
  | {
      readonly kind: "updated";
      readonly period: BudgetPeriodRecord;
      readonly linkedPeriod?: BudgetPeriodRecord;
    }
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
    readonly budgetYen?: number;
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
    left.editedPeriodId === right.editedPeriodId &&
    snapshotsMatch(left.previous.before, right.previous.before) &&
    afterValuesMatch(left.previous.after, right.previous.after) &&
    snapshotsMatch(left.next.before, right.next.before) &&
    afterValuesMatch(left.next.after, right.next.after)
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
  tracing?: TracingAdapter,
) => Effect.Effect<PeriodUpdateServiceResult, Error> {
  const budgetPeriodRepository = dependencies.budgetPeriodRepository;
  function loadBoundaryInput(
    target: BudgetPeriodRecord,
    request: Extract<PeriodUpdateRequest, { startDate: string }>,
  ) {
    return Effect.gen(function* () {
      const requested = {
        ...request,
        budgetYen: request.budgetYen ?? target.budgetYen,
      };
      const predecessorId = getEarlierBoundaryPredecessorId(target, requested);
      const successors =
        predecessorId === null && request.endDate !== target.endDate
          ? yield* budgetPeriodRepository.findSuccessorsByPredecessorId(
              target.id,
            )
          : [];

      const predecessor = predecessorId
        ? yield* budgetPeriodRepository.findById(predecessorId)
        : null;
      const predecessorSuccessors = predecessorId
        ? yield* budgetPeriodRepository.findSuccessorsByPredecessorId(
            predecessorId,
          )
        : [];
      return {
        target,
        successors,
        predecessor,
        predecessorSuccessors,
        requested,
      };
    });
  }

  function updateRange(
    periodId: string,
    request: Extract<PeriodUpdateRequest, { startDate: string }>,
    tracing: TracingAdapter,
  ): Effect.Effect<PeriodUpdateServiceResult, Error> {
    return Effect.gen(function* () {
      const target = yield* budgetPeriodRepository.findById(periodId);
      if (!target) {
        return yield* Effect.fail(new PeriodNotFoundError(periodId));
      }
      const boundaryInput = yield* loadBoundaryInput(target, request);
      const confirmation = request.confirmation;
      if (confirmation !== undefined) {
        return yield* withTracingEffect<PeriodUpdateServiceResult>(
          tracing,
          "api.budget_period.linked_boundary.confirm",
          Effect.gen(function* () {
            const decision = yield* Effect.try({
              try: () => decidePeriodBoundaryUpdate(boundaryInput),
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
                    target: decision.proposal.previous,
                    successor: decision.proposal.next,
                    nowIso: dependencies.nowIso(),
                  } as LinkedPeriodBoundaryUpdateCommand)
                  .pipe(
                    Effect.catchIf(
                      (error) =>
                        error instanceof LinkedPeriodBoundaryConflictError,
                      () => confirmationConflict(),
                    ),
                  );
                const editedTarget = periodId === result.target.id;
                return {
                  kind: "updated",
                  period: editedTarget ? result.target : result.successor,
                  linkedPeriod: editedTarget ? result.successor : result.target,
                };
              }
            }
          }),
          () => ({
            "app.operation": "api.budget_period.linked_boundary.confirm",
            "app.route": "/api/periods/[periodId]",
          }),
        );
      }

      const decision = yield* Effect.try({
        try: () => decidePeriodBoundaryUpdate(boundaryInput),
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
          return yield* withTracingEffect(
            tracing,
            "api.budget_period.linked_boundary.propose",
            Effect.gen(function* () {
              const periods =
                yield* dependencies.budgetPeriodRepository.listPeriods();
              yield* Effect.try({
                try: () => {
                  const { previous, next } = decision.proposal;
                  const others = periods.filter(
                    (period) =>
                      period.id !== previous.before.id &&
                      period.id !== next.before.id,
                  );
                  assertPeriodHasNoOverlap(others, previous.after);
                  assertPeriodHasNoOverlap(others, next.after);
                  const outerPrevious = periods.find(
                    (period) =>
                      period.id === previous.before.predecessorPeriodId,
                  );
                  assertPeriodPredecessorContinuity(
                    previous.before.predecessorPeriodId,
                    outerPrevious?.endDate ?? null,
                    previous.after.startDate,
                  );
                  assertPeriodSuccessorContinuity(
                    next.after.endDate,
                    others.filter(
                      (period) => period.predecessorPeriodId === next.before.id,
                    ),
                  );
                },
                catch: toEffectError,
              });
              yield* dependencies.assertNoOutOfRangeEntries(
                decision.proposal.previous.after.id,
                decision.proposal.previous.after.startDate,
                decision.proposal.previous.after.endDate,
              );
              yield* dependencies.assertNoOutOfRangeEntries(
                decision.proposal.next.after.id,
                decision.proposal.next.after.startDate,
                decision.proposal.next.after.endDate,
              );
              return decision;
            }),
            () => ({
              "app.operation": "api.budget_period.linked_boundary.propose",
              "app.route": "/api/periods/[periodId]",
            }),
          );
      }
    });
  }

  return (periodId, request, tracing = noopTracing) => {
    if (request.startDate !== undefined)
      return updateRange(periodId, request, tracing);
    return budgetPeriodRepository
      .updateBudget({
        id: periodId,
        budgetYen: request.budgetYen,
        nowIso: dependencies.nowIso(),
      })
      .pipe(Effect.map((period) => ({ kind: "updated", period })));
  };
}
