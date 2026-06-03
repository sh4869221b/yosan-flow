import { and, asc, eq, gte, lte, ne } from "drizzle-orm";
import { Effect } from "effect";
import { createDrizzleD1Database } from "$lib/server/db/client";
import type { D1Database } from "$lib/server/db/d1-types";
import { budget_periods, type BudgetPeriodRow } from "$lib/server/db/schema";
import {
  assertNoOverlap,
  assertPredecessorContinuity,
  assertSuccessorContinuity,
  assertValidBudgetYen,
  assertValidPeriodRange,
} from "$lib/server/db/budget-period-validation";
import { toEffectError } from "$lib/server/effect/runtime";
import { isDateWithinPeriod } from "$lib/server/domain/budget-period";

type BudgetPeriodStatus = "active" | "closed";

export type BudgetPeriodRecord = {
  id: string;
  startDate: string;
  endDate: string;
  budgetYen: number;
  status: BudgetPeriodStatus;
  predecessorPeriodId: string | null;
  createdAt: string;
  updatedAt: string;
};

type CreateBudgetPeriodInput = {
  id: string;
  startDate: string;
  endDate: string;
  budgetYen: number;
  status?: BudgetPeriodStatus;
  predecessorPeriodId?: string | null;
  nowIso: string;
};

type UpdateBudgetPeriodInput = {
  id: string;
  startDate: string;
  endDate: string;
  budgetYen: number;
  nowIso: string;
};

export class PeriodValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PeriodValidationError";
    this.code = code;
  }
}

class PeriodNotFoundError extends Error {
  readonly code = "PERIOD_NOT_FOUND";

  constructor(periodId: string) {
    super(`period not found: ${periodId}`);
    this.name = "PeriodNotFoundError";
  }
}

export interface BudgetPeriodRepository {
  findById(id: string): Effect.Effect<BudgetPeriodRecord | null, Error>;
  findByDate(date: string): Effect.Effect<BudgetPeriodRecord | null, Error>;
  listPeriods(): Effect.Effect<BudgetPeriodRecord[], Error>;
  createPeriod(
    input: CreateBudgetPeriodInput,
  ): Effect.Effect<BudgetPeriodRecord, Error>;
  updatePeriod(
    input: UpdateBudgetPeriodInput,
  ): Effect.Effect<BudgetPeriodRecord, Error>;
}

function clonePeriod(record: BudgetPeriodRecord): BudgetPeriodRecord {
  return { ...record };
}

function toBudgetPeriodRecord(row: BudgetPeriodRow): BudgetPeriodRecord {
  return {
    id: row.id,
    startDate: row.start_date,
    endDate: row.end_date,
    budgetYen: row.budget_yen,
    status: row.status,
    predecessorPeriodId: row.predecessor_period_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createInMemoryBudgetPeriodRepository(
  initialPeriods: BudgetPeriodRecord[] = [],
): BudgetPeriodRepository {
  const createValidationError = (code: string, message: string) =>
    new PeriodValidationError(code, message);
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
          assertValidBudgetYen(input.budgetYen);
          assertValidPeriodRange(
            input.startDate,
            input.endDate,
            createValidationError,
          );
          assertPredecessorContinuity(
            input.predecessorPeriodId,
            input.predecessorPeriodId
              ? (store.get(input.predecessorPeriodId)?.endDate ?? null)
              : null,
            input.startDate,
            createValidationError,
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

          assertNoOverlap(store.values(), next, createValidationError);
          store.set(next.id, next);
          return clonePeriod(next);
        },
        catch: toEffectError,
      });
    },

    updatePeriod(input) {
      return Effect.try({
        try: () => {
          assertValidBudgetYen(input.budgetYen);
          assertValidPeriodRange(
            input.startDate,
            input.endDate,
            createValidationError,
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

          assertNoOverlap(store.values(), updated, createValidationError);
          assertPredecessorContinuity(
            updated.predecessorPeriodId,
            updated.predecessorPeriodId
              ? (store.get(updated.predecessorPeriodId)?.endDate ?? null)
              : null,
            updated.startDate,
            createValidationError,
          );
          assertSuccessorContinuity(
            updated.endDate,
            [...store.values()]
              .filter(
                (candidate) => candidate.predecessorPeriodId === updated.id,
              )
              .map((candidate) => ({
                id: candidate.id,
                startDate: candidate.startDate,
              })),
            createValidationError,
          );

          store.set(updated.id, updated);
          return clonePeriod(updated);
        },
        catch: toEffectError,
      });
    },
  };
}

type CreateD1BudgetPeriodRepositoryInput = {
  db: D1Database;
};

export function createD1BudgetPeriodRepository(
  input: CreateD1BudgetPeriodRepositoryInput,
): BudgetPeriodRepository {
  const createValidationError = (code: string, message: string) =>
    new PeriodValidationError(code, message);
  const database = createDrizzleD1Database(input.db);
  const findByIdInternal = async (
    id: string,
  ): Promise<BudgetPeriodRecord | null> => {
    const [row] = await database
      .select()
      .from(budget_periods)
      .where(eq(budget_periods.id, id))
      .limit(1)
      .all();
    return row ? toBudgetPeriodRecord(row) : null;
  };

  return {
    findById(id) {
      return Effect.tryPromise({
        try: () => findByIdInternal(id),
        catch: toEffectError,
      });
    },

    findByDate(date) {
      return Effect.tryPromise({
        try: async () => {
          const [row] = await database
            .select()
            .from(budget_periods)
            .where(
              and(
                lte(budget_periods.start_date, date),
                gte(budget_periods.end_date, date),
              ),
            )
            .orderBy(asc(budget_periods.start_date))
            .limit(1)
            .all();
          return row ? toBudgetPeriodRecord(row) : null;
        },
        catch: toEffectError,
      });
    },

    listPeriods() {
      return Effect.tryPromise({
        try: async () => {
          const rows = await database
            .select()
            .from(budget_periods)
            .orderBy(asc(budget_periods.start_date))
            .all();
          return rows.map((row) => toBudgetPeriodRecord(row));
        },
        catch: toEffectError,
      });
    },

    createPeriod(inputRow) {
      return Effect.tryPromise({
        try: async () => {
          assertValidBudgetYen(inputRow.budgetYen);
          assertValidPeriodRange(
            inputRow.startDate,
            inputRow.endDate,
            createValidationError,
          );

          const existing = await findByIdInternal(inputRow.id);
          if (existing) {
            return existing;
          }

          let predecessorEndDate: string | null = null;
          if (inputRow.predecessorPeriodId) {
            const [predecessor] = await database
              .select({ end_date: budget_periods.end_date })
              .from(budget_periods)
              .where(eq(budget_periods.id, inputRow.predecessorPeriodId))
              .limit(1)
              .all();
            predecessorEndDate = predecessor?.end_date ?? null;
          }
          assertPredecessorContinuity(
            inputRow.predecessorPeriodId,
            predecessorEndDate,
            inputRow.startDate,
            createValidationError,
          );

          const [overlapped] = await database
            .select({ id: budget_periods.id })
            .from(budget_periods)
            .where(
              and(
                lte(budget_periods.start_date, inputRow.endDate),
                gte(budget_periods.end_date, inputRow.startDate),
              ),
            )
            .limit(1)
            .all();
          if (overlapped) {
            assertNoOverlap(
              [
                {
                  id: overlapped.id,
                  startDate: inputRow.startDate,
                  endDate: inputRow.endDate,
                },
              ],
              {
                id: inputRow.id,
                startDate: inputRow.startDate,
                endDate: inputRow.endDate,
              },
              createValidationError,
            );
          }

          await database
            .insert(budget_periods)
            .values({
              id: inputRow.id,
              start_date: inputRow.startDate,
              end_date: inputRow.endDate,
              budget_yen: inputRow.budgetYen,
              status: inputRow.status ?? "active",
              predecessor_period_id: inputRow.predecessorPeriodId ?? null,
              created_at: inputRow.nowIso,
              updated_at: inputRow.nowIso,
            })
            .run();

          const created = await findByIdInternal(inputRow.id);
          if (!created) {
            throw new Error(
              `budget period not found after create: ${inputRow.id}`,
            );
          }
          return created;
        },
        catch: toEffectError,
      });
    },

    updatePeriod(inputRow) {
      return Effect.tryPromise({
        try: async () => {
          assertValidBudgetYen(inputRow.budgetYen);
          assertValidPeriodRange(
            inputRow.startDate,
            inputRow.endDate,
            createValidationError,
          );

          const existing = await findByIdInternal(inputRow.id);
          if (!existing) {
            throw new PeriodNotFoundError(inputRow.id);
          }
          let predecessorEndDate: string | null = null;
          if (existing.predecessorPeriodId) {
            const [predecessor] = await database
              .select({ end_date: budget_periods.end_date })
              .from(budget_periods)
              .where(eq(budget_periods.id, existing.predecessorPeriodId))
              .limit(1)
              .all();
            predecessorEndDate = predecessor?.end_date ?? null;
          }
          assertPredecessorContinuity(
            existing.predecessorPeriodId,
            predecessorEndDate,
            inputRow.startDate,
            createValidationError,
          );

          const successors = await database
            .select({
              id: budget_periods.id,
              start_date: budget_periods.start_date,
            })
            .from(budget_periods)
            .where(eq(budget_periods.predecessor_period_id, inputRow.id))
            .all();
          assertSuccessorContinuity(
            inputRow.endDate,
            successors.map((row) => ({
              id: row.id,
              startDate: row.start_date,
            })),
            createValidationError,
          );

          const [overlapped] = await database
            .select({ id: budget_periods.id })
            .from(budget_periods)
            .where(
              and(
                ne(budget_periods.id, inputRow.id),
                lte(budget_periods.start_date, inputRow.endDate),
                gte(budget_periods.end_date, inputRow.startDate),
              ),
            )
            .limit(1)
            .all();
          if (overlapped) {
            assertNoOverlap(
              [
                {
                  id: overlapped.id,
                  startDate: inputRow.startDate,
                  endDate: inputRow.endDate,
                },
              ],
              {
                id: inputRow.id,
                startDate: inputRow.startDate,
                endDate: inputRow.endDate,
              },
              createValidationError,
            );
          }

          await database
            .update(budget_periods)
            .set({
              start_date: inputRow.startDate,
              end_date: inputRow.endDate,
              budget_yen: inputRow.budgetYen,
              updated_at: inputRow.nowIso,
            })
            .where(eq(budget_periods.id, inputRow.id))
            .run();

          const updated = await findByIdInternal(inputRow.id);
          if (!updated) {
            throw new Error(`period not found after update: ${inputRow.id}`);
          }
          return updated;
        },
        catch: toEffectError,
      });
    },
  };
}
