import {
  assertNoOverlap,
  assertPredecessorContinuity,
  assertSuccessorContinuity,
  assertValidBudgetYen,
  assertValidPeriodRange,
  type BudgetPeriodLike,
  type BudgetPeriodSuccessorLike,
} from "$lib/server/db/budget-period-validation";
import { PeriodValidationError } from "$lib/server/db/budget-period-types";

function createPeriodValidationError(
  code: string,
  message: string,
): PeriodValidationError {
  return new PeriodValidationError(code, message);
}

export function assertValidPeriodInput(
  startDate: string,
  endDate: string,
  budgetYen: number,
): void {
  assertValidBudgetYen(budgetYen);
  assertValidPeriodRange(startDate, endDate, createPeriodValidationError);
}

export function assertPeriodHasNoOverlap(
  periods: Iterable<BudgetPeriodLike>,
  target: BudgetPeriodLike,
): void {
  assertNoOverlap(periods, target, createPeriodValidationError);
}

export function assertPeriodPredecessorContinuity(
  predecessorPeriodId: string | null | undefined,
  predecessorEndDate: string | null,
  startDate: string,
): void {
  assertPredecessorContinuity(
    predecessorPeriodId,
    predecessorEndDate,
    startDate,
    createPeriodValidationError,
  );
}

export function assertPeriodSuccessorContinuity(
  updatedEndDate: string,
  successors: Iterable<BudgetPeriodSuccessorLike>,
): void {
  assertSuccessorContinuity(
    updatedEndDate,
    successors,
    createPeriodValidationError,
  );
}
