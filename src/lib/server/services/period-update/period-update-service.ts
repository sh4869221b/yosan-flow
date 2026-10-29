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
} from "#lib/server/db/budget-period-repository.ts";
import { PeriodNotFoundError } from "#lib/server/db/budget-period-types.ts";
import { decidePeriodBoundaryUpdate } from "#lib/server/services/period-update/period-boundary-decision.ts";
import { toEffectError } from "#lib/server/effect/runtime.ts";
import {
  assertPeriodHasNoOverlap,
  assertPeriodPredecessorContinuity,
  assertPeriodSuccessorContinuity,
  assertValidPeriodInput,
} from "#lib/server/db/budget-period-validation-coordinator.ts";
import {
  PeriodUpdateConflictError,
  type PeriodBoundaryAfter,
  type PeriodBoundaryUpdateProposal,
  type PeriodSnapshot,
  type PeriodUpdateRequest,
} from "#lib/server/services/period-update/period-update-types.ts";

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
  return (periodId, request, tracing = noopTracing) =>
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

      const predecessor = target.predecessorPeriodId
        ? yield* dependencies.budgetPeriodRepository.findById(
            target.predecessorPeriodId,
          )
        : null;
      const predecessorSuccessors = target.predecessorPeriodId
        ? yield* dependencies.budgetPeriodRepository.findSuccessorsByPredecessorId(
            target.predecessorPeriodId,
          )
        : [];
      const confirmation = request.confirmation;
      if (confirmation !== undefined) {
        return yield* withTracingEffect<PeriodUpdateServiceResult>(
          tracing,
          "api.budget_period.linked_boundary.confirm",
          Effect.gen(function* () {
            const decision = yield* Effect.try({
              try: () =>
                decidePeriodBoundaryUpdate({
                  target,
                  successors,
                  predecessor,
                  predecessorSuccessors,
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
                    target: decision.proposal.previous,
                    successor: decision.proposal.next,
                    nowIso: dependencies.nowIso(),
                  })
                  .pipe(
                    Effect.catchIf(
                      (error) =>
                        error instanceof LinkedPeriodBoundaryConflictError,
                      () => confirmationConflict(),
                    ),
                  );
                return {
                  kind: "updated",
                  period:
                    periodId === result.target.id
                      ? result.target
                      : result.successor,
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
        try: () => {
          assertValidPeriodInput(
            request.startDate,
            request.endDate,
            request.budgetYen,
          );
          return decidePeriodBoundaryUpdate({
            target,
            successors,
            predecessor,
            predecessorSuccessors,
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
