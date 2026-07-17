import { getNextPeriodStartDate } from "$lib/server/domain/budget-period";
import {
  assertPeriodSuccessorContinuity,
  assertValidPeriodInput,
} from "$lib/server/db/budget-period-validation-coordinator";
import {
  PeriodMultipleSuccessorsError,
  type PeriodBoundaryUpdateDecision,
  type PeriodSnapshot,
  type PeriodUpdateValues,
} from "$lib/server/services/period-update/period-update-types";

export type PeriodBoundaryDecisionInput = {
  readonly target: PeriodSnapshot;
  readonly successors: readonly PeriodSnapshot[];
  readonly requested: PeriodUpdateValues;
};

export function decidePeriodBoundaryUpdate({
  target,
  successors,
  requested,
}: PeriodBoundaryDecisionInput): PeriodBoundaryUpdateDecision {
  if (requested.endDate <= target.endDate || successors.length === 0) {
    return { kind: "ordinary-update" };
  }

  if (successors.length > 1) {
    throw new PeriodMultipleSuccessorsError();
  }

  const successor = successors[0];
  if (successor === undefined || requested.endDate < successor.startDate) {
    return { kind: "ordinary-update" };
  }

  assertPeriodSuccessorContinuity(target.endDate, [successor]);

  assertValidPeriodInput(target.startDate, requested.endDate, target.budgetYen);
  const successorStartDate = getNextPeriodStartDate(requested.endDate);
  assertValidPeriodInput(
    successorStartDate,
    successor.endDate,
    successor.budgetYen,
  );

  return {
    kind: "confirmation-required",
    proposal: {
      version: 1,
      target: {
        before: target,
        after: {
          id: target.id,
          startDate: requested.startDate,
          endDate: requested.endDate,
          budgetYen: requested.budgetYen,
        },
      },
      successor: {
        before: successor,
        after: {
          id: successor.id,
          startDate: successorStartDate,
          endDate: successor.endDate,
          budgetYen: successor.budgetYen,
        },
      },
    },
  };
}
