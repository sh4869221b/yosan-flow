import { and, asc, eq, gte, lte, ne } from "drizzle-orm";
import { Effect } from "effect";
import { createDrizzleD1Database } from "#lib/server/db/client.ts";
import {
  insertD1BudgetPeriod,
  updateD1BudgetPeriod,
  rejectD1BudgetPeriodWrite,
} from "#lib/server/db/budget-period-write-d1.ts";
import { updateD1LinkedPeriodBoundary } from "#lib/server/db/budget-period-boundary-d1.ts";
import {
  findD1BudgetPeriodById,
  findD1SuccessorsByPredecessorId,
} from "#lib/server/db/budget-period-d1-query.ts";
import type { D1Database } from "#lib/server/db/d1-types.ts";
import { toBudgetPeriodRecord } from "#lib/server/db/budget-period-row-mapper.ts";
import {
  assertPeriodHasNoOverlap,
  assertPeriodPredecessorContinuity,
  assertPeriodSuccessorContinuity,
} from "#lib/server/db/budget-period-validation-coordinator.ts";
import type { BudgetPeriodRepository } from "#lib/server/db/budget-period-types.ts";
import { PeriodNotFoundError } from "#lib/server/db/budget-period-types.ts";
import { budget_periods } from "#lib/server/db/schema.ts";
import { assertValidDate } from "#lib/server/domain/daily-entry.ts";
import { toEffectError } from "#lib/server/effect/runtime.ts";

type CreateD1BudgetPeriodRepositoryInput = {
  db: D1Database;
};

export function createD1BudgetPeriodRepository(
  input: CreateD1BudgetPeriodRepositoryInput,
): BudgetPeriodRepository {
  const database = createDrizzleD1Database(input.db);

  async function assertNoOverlap(
    target: { id: string; startDate: string; endDate: string },
    excludedId?: string,
  ): Promise<void> {
    const [overlapped] = await database
      .select({ id: budget_periods.id })
      .from(budget_periods)
      .where(
        and(
          excludedId === undefined
            ? undefined
            : ne(budget_periods.id, excludedId),
          lte(budget_periods.start_date, target.endDate),
          gte(budget_periods.end_date, target.startDate),
        ),
      )
      .limit(1)
      .all();
    if (overlapped) {
      assertPeriodHasNoOverlap(
        [
          {
            id: overlapped.id,
            startDate: target.startDate,
            endDate: target.endDate,
          },
        ],
        target,
      );
    }
  }

  return {
    findById(id) {
      return Effect.tryPromise({
        try: () => findD1BudgetPeriodById(database, id),
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

    findSuccessorsByPredecessorId(predecessorPeriodId) {
      return Effect.tryPromise({
        try: () =>
          findD1SuccessorsByPredecessorId(database, predecessorPeriodId),
        catch: toEffectError,
      });
    },

    createPeriod(inputRow) {
      return Effect.tryPromise({
        try: async () => {
          const existing = await findD1BudgetPeriodById(database, inputRow.id);
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
            if (predecessorEndDate !== null)
              assertValidDate(predecessorEndDate);
          }
          assertPeriodPredecessorContinuity(
            inputRow.predecessorPeriodId,
            predecessorEndDate,
            inputRow.startDate,
          );

          await assertNoOverlap(inputRow);

          const inserted = await insertD1BudgetPeriod(database, inputRow);
          if (inserted) {
            return toBudgetPeriodRecord(inserted);
          }

          const concurrent = await findD1BudgetPeriodById(
            database,
            inputRow.id,
          );
          return (
            concurrent ??
            rejectD1BudgetPeriodWrite(database, inputRow, "create")
          );
        },
        catch: toEffectError,
      });
    },

    updatePeriod(inputRow) {
      return Effect.tryPromise({
        try: async () => {
          const existing = await findD1BudgetPeriodById(database, inputRow.id);
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
            if (predecessorEndDate !== null)
              assertValidDate(predecessorEndDate);
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
            successors.map((row) => {
              assertValidDate(row.start_date);
              return { id: row.id, startDate: row.start_date };
            }),
          );

          await assertNoOverlap(inputRow, inputRow.id);

          const updated = await updateD1BudgetPeriod(database, inputRow);
          if (!updated) {
            return rejectD1BudgetPeriodWrite(database, inputRow, "update");
          }
          return toBudgetPeriodRecord(updated);
        },
        catch: toEffectError,
      });
    },

    updateBudget({ id, budgetYen, nowIso }) {
      return Effect.tryPromise({
        try: async () => {
          const row = await database
            .update(budget_periods)
            .set({ budget_yen: budgetYen, updated_at: nowIso })
            .where(eq(budget_periods.id, id))
            .returning()
            .get();
          if (!row) throw new PeriodNotFoundError(id);
          return toBudgetPeriodRecord(row);
        },
        catch: toEffectError,
      });
    },

    updateLinkedBoundary: (command) =>
      Effect.tryPromise({
        try: () => updateD1LinkedPeriodBoundary(database, command),
        catch: toEffectError,
      }),
  };
}
