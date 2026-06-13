import { and, asc, eq, gte, lte, ne } from "drizzle-orm";
import { Effect } from "effect";
import { createDrizzleD1Database } from "$lib/server/db/client";
import type { D1Database } from "$lib/server/db/d1-types";
import { toBudgetPeriodRecord } from "$lib/server/db/budget-period-row-mapper";
import {
  assertPeriodHasNoOverlap,
  assertPeriodPredecessorContinuity,
  assertPeriodSuccessorContinuity,
  assertValidPeriodInput,
} from "$lib/server/db/budget-period-validation-coordinator";
import type {
  BudgetPeriodRecord,
  BudgetPeriodRepository,
} from "$lib/server/db/budget-period-types";
import { PeriodNotFoundError } from "$lib/server/db/budget-period-types";
import { budget_periods } from "$lib/server/db/schema";
import { toEffectError } from "$lib/server/effect/runtime";

type CreateD1BudgetPeriodRepositoryInput = {
  db: D1Database;
};

export function createD1BudgetPeriodRepository(
  input: CreateD1BudgetPeriodRepositoryInput,
): BudgetPeriodRepository {
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
          assertValidPeriodInput(
            inputRow.startDate,
            inputRow.endDate,
            inputRow.budgetYen,
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
          assertPeriodPredecessorContinuity(
            inputRow.predecessorPeriodId,
            predecessorEndDate,
            inputRow.startDate,
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
            assertPeriodHasNoOverlap(
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
          assertValidPeriodInput(
            inputRow.startDate,
            inputRow.endDate,
            inputRow.budgetYen,
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
          assertPeriodPredecessorContinuity(
            existing.predecessorPeriodId,
            predecessorEndDate,
            inputRow.startDate,
          );

          const successors = await database
            .select({
              id: budget_periods.id,
              start_date: budget_periods.start_date,
            })
            .from(budget_periods)
            .where(eq(budget_periods.predecessor_period_id, inputRow.id))
            .all();
          assertPeriodSuccessorContinuity(
            inputRow.endDate,
            successors.map((row) => ({
              id: row.id,
              startDate: row.start_date,
            })),
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
            assertPeriodHasNoOverlap(
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
