import { Effect } from "effect";
import {
  assertPeriodHasNoOverlap,
  assertPeriodPredecessorContinuity,
  assertPeriodSuccessorContinuity,
  assertValidPeriodInput,
} from "$lib/server/db/budget-period-validation-coordinator";
import { clonePeriod } from "$lib/server/db/budget-period-row-mapper";
import type {
  BudgetPeriodRecord,
  BudgetPeriodRepository,
} from "$lib/server/db/budget-period-types";
import { PeriodNotFoundError } from "$lib/server/db/budget-period-types";
import { isDateWithinPeriod } from "$lib/server/domain/budget-period";
import { toEffectError } from "$lib/server/effect/runtime";

export function createInMemoryBudgetPeriodRepository(
  initialPeriods: BudgetPeriodRecord[] = [],
): BudgetPeriodRepository {
  const store = new Map<string, BudgetPeriodRecord>();
  for (const period of initialPeriods) {
    store.set(period.id, clonePeriod(period));
  }

  return {
    findById(id) {
      return Effect.try({
        try: () => {
          const found = store.get(id);
          return found ? clonePeriod(found) : null;
        },
        catch: toEffectError,
      });
    },

    findByDate(date) {
      return Effect.try({
        try: () => {
          for (const period of store.values()) {
            if (isDateWithinPeriod(date, period.startDate, period.endDate)) {
              return clonePeriod(period);
            }
          }
          return null;
        },
        catch: toEffectError,
      });
    },

    listPeriods() {
      return Effect.try({
        try: () =>
          [...store.values()]
            .map((period) => clonePeriod(period))
            .sort((left, right) =>
              left.startDate.localeCompare(right.startDate),
            ),
        catch: toEffectError,
      });
    },

    createPeriod(input) {
      return Effect.try({
        try: () => {
          assertValidPeriodInput(
            input.startDate,
            input.endDate,
            input.budgetYen,
          );
          assertPeriodPredecessorContinuity(
            input.predecessorPeriodId,
            input.predecessorPeriodId
              ? (store.get(input.predecessorPeriodId)?.endDate ?? null)
              : null,
            input.startDate,
          );

          const existing = store.get(input.id);
          if (existing) {
            return clonePeriod(existing);
          }

          const next: BudgetPeriodRecord = {
            id: input.id,
            startDate: input.startDate,
            endDate: input.endDate,
            budgetYen: input.budgetYen,
            status: input.status ?? "active",
            predecessorPeriodId: input.predecessorPeriodId ?? null,
            createdAt: input.nowIso,
            updatedAt: input.nowIso,
          };

          assertPeriodHasNoOverlap(store.values(), next);
          store.set(next.id, next);
          return clonePeriod(next);
        },
        catch: toEffectError,
      });
    },

    updatePeriod(input) {
      return Effect.try({
        try: () => {
          assertValidPeriodInput(
            input.startDate,
            input.endDate,
            input.budgetYen,
          );
          const existing = store.get(input.id);
          if (!existing) {
            throw new PeriodNotFoundError(input.id);
          }

          const updated: BudgetPeriodRecord = {
            ...existing,
            startDate: input.startDate,
            endDate: input.endDate,
            budgetYen: input.budgetYen,
            updatedAt: input.nowIso,
          };

          assertPeriodHasNoOverlap(store.values(), updated);
          assertPeriodPredecessorContinuity(
            updated.predecessorPeriodId,
            updated.predecessorPeriodId
              ? (store.get(updated.predecessorPeriodId)?.endDate ?? null)
              : null,
            updated.startDate,
          );
          assertPeriodSuccessorContinuity(
            updated.endDate,
            [...store.values()]
              .filter(
                (candidate) => candidate.predecessorPeriodId === updated.id,
              )
              .map((candidate) => ({
                id: candidate.id,
                startDate: candidate.startDate,
              })),
          );

          store.set(updated.id, updated);
          return clonePeriod(updated);
        },
        catch: toEffectError,
      });
    },
  };
}
