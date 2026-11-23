import { asc, eq } from "drizzle-orm";
import { Effect } from "effect";
import type { DatabaseTransaction } from "#lib/server/db/client.ts";
import { createDrizzleD1Database } from "#lib/server/db/client.ts";
import { dailyEntryOutsideRange } from "#lib/server/db/daily-entry-range-query.ts";
import type { D1Database } from "#lib/server/db/d1-types.ts";
import { daily_totals } from "#lib/server/db/schema.ts";
import { assertValidDate } from "#lib/server/domain/daily-entry.ts";
import { toEffectError } from "#lib/server/effect/runtime.ts";

export type DailyTotalRecord = {
  date: string;
  yearMonth: string;
  budgetPeriodId: string;
  totalUsedYen: number;
  updatedAt: string;
};

type DailyTotalUpsertInput = {
  date: string;
  yearMonth: string;
  budgetPeriodId: string;
  totalUsedYen: number;
  nowIso: string;
};

type DailyTotalTransaction = DatabaseTransaction<any, DailyTotalRecord, any>;

export interface DailyTotalRepository {
  findByDate(
    tx: DailyTotalTransaction,
    date: string,
    budgetPeriodId: string,
  ): Effect.Effect<DailyTotalRecord | null, Error>;
  setDailyTotal(
    tx: DailyTotalTransaction,
    input: DailyTotalUpsertInput,
  ): Effect.Effect<DailyTotalRecord, Error>;
  deleteDailyTotal(
    tx: DailyTotalTransaction,
    input: { date: string; budgetPeriodId: string },
  ): Effect.Effect<void, Error>;
  upsertDailyTotal(
    tx: DailyTotalTransaction,
    input: DailyTotalUpsertInput,
  ): Effect.Effect<DailyTotalRecord, Error>;
}

export interface D1DailyTotalRepository {
  listByPeriodId(
    periodId: string,
  ): Effect.Effect<
    Pick<DailyTotalRecord, "date" | "budgetPeriodId" | "totalUsedYen">[],
    Error
  >;
  hasEntriesOutsidePeriod(
    periodId: string,
    startDate: string,
    endDate: string,
  ): Effect.Effect<boolean, Error>;
}

function cloneDailyTotal(row: DailyTotalRecord): DailyTotalRecord {
  return { ...row };
}

function toDailyTotalKey(date: string, budgetPeriodId: string): string {
  return `${budgetPeriodId}:${date}`;
}

export function createDailyTotalRepository(): DailyTotalRepository {
  function setDailyTotalRecord(
    tx: DailyTotalTransaction,
    input: DailyTotalUpsertInput,
  ): DailyTotalRecord {
    const next: DailyTotalRecord = {
      date: input.date,
      yearMonth: input.yearMonth,
      budgetPeriodId: input.budgetPeriodId,
      totalUsedYen: input.totalUsedYen,
      updatedAt: input.nowIso,
    };
    tx.state.dailyTotals.set(
      toDailyTotalKey(input.date, input.budgetPeriodId),
      next,
    );
    return cloneDailyTotal(next);
  }

  return {
    findByDate(tx, date, budgetPeriodId) {
      return Effect.try({
        try: () => {
          const found = tx.state.dailyTotals.get(
            toDailyTotalKey(date, budgetPeriodId),
          );
          if (!found) {
            return null;
          }
          if (found.budgetPeriodId !== budgetPeriodId) {
            return null;
          }
          return cloneDailyTotal(found);
        },
        catch: toEffectError,
      });
    },

    setDailyTotal(tx, input) {
      return Effect.try({
        try: () => setDailyTotalRecord(tx, input),
        catch: toEffectError,
      });
    },

    deleteDailyTotal(tx, input) {
      return Effect.try({
        try: () => {
          tx.state.dailyTotals.delete(
            toDailyTotalKey(input.date, input.budgetPeriodId),
          );
        },
        catch: toEffectError,
      });
    },

    upsertDailyTotal(tx, input) {
      return Effect.try({
        try: () => setDailyTotalRecord(tx, input),
        catch: toEffectError,
      });
    },
  };
}

type CreateD1DailyTotalRepositoryInput = {
  db: D1Database;
};

export function createD1DailyTotalRepository(
  input: CreateD1DailyTotalRepositoryInput,
): D1DailyTotalRepository {
  const database = createDrizzleD1Database(input.db);

  return {
    listByPeriodId(periodId) {
      return Effect.tryPromise({
        try: async () => {
          const rows = await database
            .select({
              date: daily_totals.date,
              budgetPeriodId: daily_totals.budget_period_id,
              totalUsedYen: daily_totals.total_used_yen,
            })
            .from(daily_totals)
            .where(eq(daily_totals.budget_period_id, periodId))
            .orderBy(asc(daily_totals.date))
            .all();
          for (const { date } of rows) {
            assertValidDate(date);
          }
          return rows;
        },
        catch: toEffectError,
      });
    },

    hasEntriesOutsidePeriod(periodId, startDate, endDate) {
      return Effect.tryPromise({
        try: async () => {
          const [row] = await database
            .select({ date: daily_totals.date })
            .from(daily_totals)
            .where(
              dailyEntryOutsideRange(
                daily_totals,
                periodId,
                startDate,
                endDate,
              ),
            )
            .limit(1)
            .all();
          return Boolean(row);
        },
        catch: toEffectError,
      });
    },
  };
}
