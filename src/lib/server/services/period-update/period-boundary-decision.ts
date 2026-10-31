import {
  getNextPeriodStartDate,
  getPreviousPeriodEndDate,
} from "#lib/server/domain/budget-period.ts";
import {
  assertPeriodSuccessorContinuity,
  assertValidPeriodInput,
} from "#lib/server/db/budget-period-validation-coordinator.ts";
import { PeriodValidationError } from "#lib/server/db/budget-period-types.ts";
import {
  PeriodMultipleSuccessorsError,
  type PeriodBoundaryUpdateDecision,
  type PeriodSnapshot,
  type PeriodUpdateValues,
} from "#lib/server/services/period-update/period-update-types.ts";

export type PeriodBoundaryDecisionInput = {
  readonly target: PeriodSnapshot;
  readonly successors: readonly PeriodSnapshot[];
  readonly predecessor?: PeriodSnapshot | null;
  readonly predecessorSuccessors?: readonly PeriodSnapshot[];
  readonly requested: PeriodUpdateValues;
};

type BoundaryPair = {
  readonly previous: PeriodSnapshot;
  readonly next: PeriodSnapshot;
  readonly reverse: boolean;
};

function resolveReversePair(input: PeriodBoundaryDecisionInput): BoundaryPair {
  const { target, predecessor, predecessorSuccessors = [] } = input;
  if (predecessorSuccessors.length > 1)
    throw new PeriodMultipleSuccessorsError();
  if (
    !predecessor ||
    predecessor.id !== target.predecessorPeriodId ||
    predecessorSuccessors.length !== 1 ||
    predecessorSuccessors[0]?.id !== target.id
  ) {
    throw new PeriodValidationError(
      "PERIOD_PREDECESSOR_NOT_FOUND",
      "linked predecessor not found",
    );
  }
  return { previous: predecessor, next: target, reverse: true };
}

function resolveForwardPair(
  input: PeriodBoundaryDecisionInput,
): BoundaryPair | null {
  const { target, successors, requested } = input;
  if (requested.endDate === target.endDate || successors.length === 0)
    return null;
  if (successors.length > 1) throw new PeriodMultipleSuccessorsError();
  const successor = successors[0];
  if (!successor) return null;
  if (
    requested.endDate > target.endDate &&
    requested.endDate < successor.startDate
  )
    return null;
  if (successor.predecessorPeriodId !== target.id) {
    throw new PeriodValidationError(
      "PERIOD_CONTINUITY_VIOLATION",
      "successor link does not match",
    );
  }
  return { previous: target, next: successor, reverse: false };
}

function buildProposal(
  input: PeriodBoundaryDecisionInput,
  pair: BoundaryPair,
): PeriodBoundaryUpdateDecision {
  const { target, requested } = input;
  const { previous, next, reverse } = pair;
  assertPeriodSuccessorContinuity(previous.endDate, [next]);
  assertValidPeriodInput(
    requested.startDate,
    requested.endDate,
    requested.budgetYen,
  );
  const editedAfter = {
    id: target.id,
    startDate: requested.startDate,
    endDate: requested.endDate,
    budgetYen: requested.budgetYen,
  };
  const previousAfter = reverse
    ? {
        id: previous.id,
        startDate: previous.startDate,
        endDate: getPreviousPeriodEndDate(requested.startDate),
        budgetYen: previous.budgetYen,
      }
    : editedAfter;
  const nextAfter = reverse
    ? editedAfter
    : {
        id: next.id,
        startDate: getNextPeriodStartDate(requested.endDate),
        endDate: next.endDate,
        budgetYen: next.budgetYen,
      };
  assertValidPeriodInput(
    previousAfter.startDate,
    previousAfter.endDate,
    previousAfter.budgetYen,
  );
  assertValidPeriodInput(
    nextAfter.startDate,
    nextAfter.endDate,
    nextAfter.budgetYen,
  );
  return {
    kind: "confirmation-required",
    proposal: {
      editedPeriodId: target.id,
      previous: { before: previous, after: previousAfter },
      next: { before: next, after: nextAfter },
    },
  };
}

export function decidePeriodBoundaryUpdate(
  input: PeriodBoundaryDecisionInput,
): PeriodBoundaryUpdateDecision {
  const reverse =
    input.requested.startDate < input.target.startDate &&
    input.target.predecessorPeriodId !== null;
  const pair = reverse ? resolveReversePair(input) : resolveForwardPair(input);
  return pair ? buildProposal(input, pair) : { kind: "ordinary-update" };
}
