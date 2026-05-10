import { and, asc, eq, gt, lt, or, sql } from "drizzle-orm";
import { Effect } from "effect";
import type { DatabaseTransaction } from "$lib/server/db/client";
import { createDrizzleD1Database } from "$lib/server/db/client";
import type { D1Database, D1PreparedStatement } from "$lib/server/db/d1-types";
import { daily_totals, type DailyTotalRow } from "$lib/server/db/schema";
import { toEffectError } from "$lib/server/effect/runtime";

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

type D1DailyTotalUpsertMode = "add" | "overwrite";

type DailyTotalTransaction = DatabaseTransaction<any, DailyTotalRecord, any>;

export interface DailyTotalRepository {
  findByDate(
    tx: DailyTotalTransaction,
    date: string,
    budgetPeriodId: string,
  ): Effect.Effect<DailyTotalRecord | null, Error>;
  upsertDailyTotal(
    tx: DailyTotalTransaction,
    input: DailyTotalUpsertInput,
  ): Effect.Effect<DailyTotalRecord, Error>;
}

export interface D1DailyTotalRepository {
  findByDate(
    date: string,
    budgetPeriodId: string,
  ): Effect.Effect<DailyTotalRecord | null, Error>;
  upsertDailyTotal(
    input: DailyTotalUpsertInput,
  ): Effect.Effect<DailyTotalRecord, Error>;
  prepareUpsertDailyTotal(
    input: DailyTotalUpsertInput,
    mode?: D1DailyTotalUpsertMode,
  ): D1PreparedStatement;
  listByPeriodId(periodId: string): Effect.Effect<DailyTotalRecord[], Error>;
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

function toDailyTotalRecord(row: DailyTotalRow): DailyTotalRecord {
  return {
    date: row.date,
    yearMonth: row.year_month,
    budgetPeriodId: row.budget_period_id,
    totalUsedYen: row.total_used_yen,
    updatedAt: row.updated_at,
  };
}

export function createDailyTotalRepository(): DailyTotalRepository {
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

    upsertDailyTotal(tx, input) {
      return Effect.try({
        try: () => {
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
        },
        catch: toEffectError,
      });
    },
  };
}

type CreateD1DailyTotalRepositoryInput = {
  db: D1Database;
  ensureSchema?: () => Promise<void>;
};

export function createD1DailyTotalRepository(
  input: CreateD1DailyTotalRepositoryInput,
): D1DailyTotalRepository {
  const ensureSchema = input.ensureSchema ?? (async () => {});
  const database = createDrizzleD1Database(input.db);

  const findByDateInternal = async (
    date: string,
    budgetPeriodId: string,
  ): Promise<DailyTotalRecord | null> => {
    await ensureSchema();
    const [row] = await database
      .select()
      .from(daily_totals)
      .where(
        and(
          eq(daily_totals.budget_period_id, budgetPeriodId),
          eq(daily_totals.date, date),
        ),
      )
      .limit(1)
      .all();
    return row ? toDailyTotalRecord(row) : null;
  };
  const prepareUpsertDailyTotal = (
    inputRow: DailyTotalUpsertInput,
    mode: D1DailyTotalUpsertMode = "overwrite",
  ): D1PreparedStatement => {
    const nextTotal =
      mode === "add"
        ? sql`${daily_totals.total_used_yen} + excluded.total_used_yen`
        : sql`excluded.total_used_yen`;
    const query = database
      .insert(daily_totals)
      .values({
        budget_period_id: inputRow.budgetPeriodId,
        date: inputRow.date,
        year_month: inputRow.yearMonth,
        total_used_yen: inputRow.totalUsedYen,
        updated_at: inputRow.nowIso,
      })
      .onConflictDoUpdate({
        target: [daily_totals.budget_period_id, daily_totals.date],
        set: {
          year_month: sql`excluded.year_month`,
          total_used_yen: nextTotal,
          updated_at: sql`excluded.updated_at`,
        },
      })
      .toSQL();
    return input.db.prepare(query.sql).bind(...query.params);
  };

  return {
    findByDate(date, budgetPeriodId) {
      return Effect.tryPromise({
        try: () => findByDateInternal(date, budgetPeriodId),
        catch: toEffectError,
      });
    },

    upsertDailyTotal(inputRow) {
      return Effect.tryPromise({
        try: async () => {
          await ensureSchema();
          await prepareUpsertDailyTotal(inputRow).run();
          const updated = await findByDateInternal(
            inputRow.date,
            inputRow.budgetPeriodId,
          );
          if (!updated) {
            throw new Error(
              `daily total not found after upsert: ${inputRow.budgetPeriodId}:${inputRow.date}`,
            );
          }
          return updated;
        },
        catch: toEffectError,
      });
    },

    prepareUpsertDailyTotal(inputRow, mode) {
      return prepareUpsertDailyTotal(inputRow, mode);
    },

    listByPeriodId(periodId) {
      return Effect.tryPromise({
        try: async () => {
          await ensureSchema();
          const rows = await database
            .select()
            .from(daily_totals)
            .where(eq(daily_totals.budget_period_id, periodId))
            .orderBy(asc(daily_totals.date))
            .all();
          return rows.map((row) => toDailyTotalRecord(row));
        },
        catch: toEffectError,
      });
    },

    hasEntriesOutsidePeriod(periodId, startDate, endDate) {
      return Effect.tryPromise({
        try: async () => {
          await ensureSchema();
          const [row] = await database
            .select({ date: daily_totals.date })
            .from(daily_totals)
            .where(
              and(
                eq(daily_totals.budget_period_id, periodId),
                or(
                  lt(daily_totals.date, startDate),
                  gt(daily_totals.date, endDate),
                ),
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
