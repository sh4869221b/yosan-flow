import {
  getNextPeriodStartDate,
  isDateWithinPeriod,
} from "$lib/server/domain/budget-period";

export type BudgetPeriodValidationErrorFactory = (
  code: string,
  message: string,
) => Error;

export type BudgetPeriodLike = {
  id: string;
  startDate: string;
  endDate: string;
};

export type BudgetPeriodSuccessorLike = {
  id: string;
  startDate: string;
};

export function assertValidBudgetYen(budgetYen: number): void {
  if (!Number.isInteger(budgetYen) || budgetYen < 0) {
    throw new Error(`Invalid budgetYen: ${budgetYen}`);
  }
}

export function assertValidPeriodRange(
  startDate: string,
  endDate: string,
  createValidationError: BudgetPeriodValidationErrorFactory,
): void {
  try {
    isDateWithinPeriod(startDate, startDate, endDate);
  } catch {
    throw createValidationError(
      "INVALID_PERIOD_RANGE",
      `Invalid period: ${startDate}..${endDate}`,
    );
  }
}

export function assertNoOverlap(
  periods: Iterable<BudgetPeriodLike>,
  target: BudgetPeriodLike,
  createValidationError: BudgetPeriodValidationErrorFactory,
): void {
  for (const current of periods) {
    if (current.id === target.id) {
      continue;
    }

    const overlaps =
      isDateWithinPeriod(
        target.startDate,
        current.startDate,
        current.endDate,
      ) ||
      isDateWithinPeriod(target.endDate, current.startDate, current.endDate) ||
      isDateWithinPeriod(current.startDate, target.startDate, target.endDate) ||
      isDateWithinPeriod(current.endDate, target.startDate, target.endDate);
    if (overlaps) {
      throw createValidationError(
        "PERIOD_OVERLAP",
        `budget period overlap: ${target.id} overlaps ${current.id}`,
      );
    }
  }
}

export function assertPredecessorContinuity(
  predecessorPeriodId: string | null | undefined,
  predecessorEndDate: string | null,
  startDate: string,
  createValidationError: BudgetPeriodValidationErrorFactory,
): void {
  if (!predecessorPeriodId) {
    return;
  }

  if (!predecessorEndDate) {
    throw createValidationError(
      "PERIOD_PREDECESSOR_NOT_FOUND",
      `predecessor period not found: ${predecessorPeriodId}`,
    );
  }

  const expectedStartDate = getNextPeriodStartDate(predecessorEndDate);
  if (startDate !== expectedStartDate) {
    throw createValidationError(
      "PERIOD_CONTINUITY_VIOLATION",
      `period must start on ${expectedStartDate} after predecessor`,
    );
  }
}

export function assertSuccessorContinuity(
  updatedEndDate: string,
  successors: Iterable<BudgetPeriodSuccessorLike>,
  createValidationError: BudgetPeriodValidationErrorFactory,
): void {
  const expectedStartDate = getNextPeriodStartDate(updatedEndDate);
  for (const candidate of successors) {
    if (candidate.startDate !== expectedStartDate) {
      throw createValidationError(
        "PERIOD_CONTINUITY_VIOLATION",
        `successor period ${candidate.id} must start on ${expectedStartDate}`,
      );
    }
  }
}
