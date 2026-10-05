import {
  getNextPeriodStartDate,
  isDateWithinPeriod,
} from "#lib/server/domain/budget-period.ts";
import { PeriodValidationError } from "#lib/server/db/budget-period-types.ts";

type BudgetPeriodLike = {
  id: string;
  startDate: string;
  endDate: string;
};

type BudgetPeriodSuccessorLike = {
  id: string;
  startDate: string;
};

export function assertValidPeriodInput(
  startDate: string,
  endDate: string,
  budgetYen: number,
): void {
  if (!Number.isInteger(budgetYen) || budgetYen < 0) {
    throw new Error(`Invalid budgetYen: ${budgetYen}`);
  }
  try {
    isDateWithinPeriod(startDate, startDate, endDate);
  } catch {
    throw new PeriodValidationError(
      "INVALID_PERIOD_RANGE",
      `Invalid period: ${startDate}..${endDate}`,
    );
  }
}

export function assertPeriodHasNoOverlap(
  periods: Iterable<BudgetPeriodLike>,
  target: BudgetPeriodLike,
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
      throw new PeriodValidationError(
        "PERIOD_OVERLAP",
        `budget period overlap: ${target.id} overlaps ${current.id}`,
      );
    }
  }
}

export function assertPeriodPredecessorContinuity(
  predecessorPeriodId: string | null | undefined,
  predecessorEndDate: string | null,
  startDate: string,
): void {
  if (!predecessorPeriodId) {
    return;
  }

  if (!predecessorEndDate) {
    throw new PeriodValidationError(
      "PERIOD_PREDECESSOR_NOT_FOUND",
      `predecessor period not found: ${predecessorPeriodId}`,
    );
  }

  const expectedStartDate = getNextPeriodStartDate(predecessorEndDate);
  if (startDate !== expectedStartDate) {
    throw new PeriodValidationError(
      "PERIOD_CONTINUITY_VIOLATION",
      `period must start on ${expectedStartDate} after predecessor`,
    );
  }
}

export function assertPeriodSuccessorContinuity(
  updatedEndDate: string,
  successors: Iterable<BudgetPeriodSuccessorLike>,
): void {
  const expectedStartDate = getNextPeriodStartDate(updatedEndDate);
  for (const candidate of successors) {
    if (candidate.startDate !== expectedStartDate) {
      throw new PeriodValidationError(
        "PERIOD_CONTINUITY_VIOLATION",
        `successor period ${candidate.id} must start on ${expectedStartDate}`,
      );
    }
  }
}
