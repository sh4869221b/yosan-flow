import { and, desc, eq, gt, lt, or, sql } from "drizzle-orm";
import { Effect } from "effect";
import type { DatabaseTransaction } from "$lib/server/db/client";
import { createDrizzleD1Database } from "$lib/server/db/client";
import type { D1Database } from "$lib/server/db/d1-types";
import { toEffectError } from "$lib/server/effect/runtime";
import {
  daily_operation_histories,
  type DailyOperationHistoryRow,
} from "$lib/server/db/schema";

type DailyOperationType = "add" | "overwrite";

export type DailyHistoryRecord = {
  id: string;
  date: string;
  budgetPeriodId: string;
  operationType: DailyOperationType;
  inputYen: number;
  beforeTotalYen: number;
  afterTotalYen: number;
  memo: string | null;
  createdAt: string;
};

type InsertDailyHistoryInput = {
  id: string;
  date: string;
  budgetPeriodId: string;
  operationType: DailyOperationType;
  inputYen: number;
  beforeTotalYen: number;
  afterTotalYen: number;
  memo: string | null;
  createdAt: string;
};

type DailyHistoryTransaction = DatabaseTransaction<
  any,
  any,
  DailyHistoryRecord
>;

export interface DailyHistoryRepository {
  findHistoryById(
    tx: DailyHistoryTransaction,
    input: { budgetPeriodId: string; date: string; historyId: string },
  ): Effect.Effect<DailyHistoryRecord | null, Error>;
  listHistoriesByDate(
    tx: DailyHistoryTransaction,
    date: string,
    budgetPeriodId: string,
  ): Effect.Effect<DailyHistoryRecord[], Error>;
  listHistoriesByDateChronological(
    tx: DailyHistoryTransaction,
    date: string,
    budgetPeriodId: string,
  ): Effect.Effect<DailyHistoryRecord[], Error>;
  insertHistory(
    tx: DailyHistoryTransaction,
    input: InsertDailyHistoryInput,
  ): Effect.Effect<DailyHistoryRecord, Error>;
  replaceHistoriesForDate(
    tx: DailyHistoryTransaction,
    input: {
      budgetPeriodId: string;
      date: string;
      histories: DailyHistoryRecord[];
    },
  ): Effect.Effect<void, Error>;
}

export interface D1DailyHistoryRepository {
  listHistoriesByDate(
    date: string,
    budgetPeriodId: string,
  ): Effect.Effect<DailyHistoryRecord[], Error>;
  insertHistory(
    input: InsertDailyHistoryInput,
  ): Effect.Effect<DailyHistoryRecord, Error>;
  hasEntriesOutsidePeriod(
    periodId: string,
    startDate: string,
    endDate: string,
  ): Effect.Effect<boolean, Error>;
}

function cloneHistory(row: DailyHistoryRecord): DailyHistoryRecord {
  return { ...row };
}

function toDailyHistoryRecord(
  row: DailyOperationHistoryRow,
): DailyHistoryRecord {
  return {
    id: row.id,
    date: row.date,
    budgetPeriodId: row.budget_period_id,
    operationType: row.operation_type,
    inputYen: row.input_yen,
    beforeTotalYen: row.before_total_yen,
    afterTotalYen: row.after_total_yen,
    memo: row.memo,
    createdAt: row.created_at,
  };
}

export function createDailyHistoryRepository(): DailyHistoryRepository {
  function findHistories(
    tx: DailyHistoryTransaction,
    date: string,
    budgetPeriodId: string,
  ): DailyHistoryRecord[] {
    return tx.state.dailyOperationHistories.filter((entry) => {
      if (entry.date !== date) {
        return false;
      }
      if (entry.budgetPeriodId !== budgetPeriodId) {
        return false;
      }
      return true;
    });
  }

  return {
    findHistoryById(tx, input) {
      return Effect.try({
        try: () => {
          const found = tx.state.dailyOperationHistories.find(
            (entry) =>
              entry.budgetPeriodId === input.budgetPeriodId &&
              entry.date === input.date &&
              entry.id === input.historyId,
          );
          return found ? cloneHistory(found) : null;
        },
        catch: toEffectError,
      });
    },

    listHistoriesByDate(tx, date, budgetPeriodId) {
      return Effect.try({
        try: () =>
          findHistories(tx, date, budgetPeriodId)
            .map((entry, index) => ({ entry, index }))
            .sort((left, right) => {
              if (left.entry.createdAt === right.entry.createdAt) {
                return right.index - left.index;
              }
              return right.entry.createdAt.localeCompare(left.entry.createdAt);
            })
            .map(({ entry }) => cloneHistory(entry)),
        catch: toEffectError,
      });
    },

    listHistoriesByDateChronological(tx, date, budgetPeriodId) {
      return Effect.try({
        try: () =>
          findHistories(tx, date, budgetPeriodId)
            .map((entry, index) => ({ entry, index }))
            .sort((left, right) => {
              if (left.entry.createdAt === right.entry.createdAt) {
                return left.index - right.index;
              }
              return left.entry.createdAt.localeCompare(right.entry.createdAt);
            })
            .map(({ entry }) => cloneHistory(entry)),
        catch: toEffectError,
      });
    },

    insertHistory(tx, input) {
      return Effect.try({
        try: () => {
          const history: DailyHistoryRecord = {
            id: input.id,
            date: input.date,
            budgetPeriodId: input.budgetPeriodId,
            operationType: input.operationType,
            inputYen: input.inputYen,
            beforeTotalYen: input.beforeTotalYen,
            afterTotalYen: input.afterTotalYen,
            memo: input.memo,
            createdAt: input.createdAt,
          };
          tx.state.dailyOperationHistories.push(history);
          return cloneHistory(history);
        },
        catch: toEffectError,
      });
    },

    replaceHistoriesForDate(tx, input) {
      return Effect.try({
        try: () => {
          tx.state.dailyOperationHistories =
            tx.state.dailyOperationHistories.filter(
              (entry) =>
                entry.budgetPeriodId !== input.budgetPeriodId ||
                entry.date !== input.date,
            );
          tx.state.dailyOperationHistories.push(
            ...input.histories.map((history) => cloneHistory(history)),
          );
        },
        catch: toEffectError,
      });
    },
  };
}

type CreateD1DailyHistoryRepositoryInput = {
  db: D1Database;
};

export function createD1DailyHistoryRepository(
  input: CreateD1DailyHistoryRepositoryInput,
): D1DailyHistoryRepository {
  const database = createDrizzleD1Database(input.db);

  const buildInsertHistoryQuery = (inputRow: InsertDailyHistoryInput) =>
    database.insert(daily_operation_histories).values({
      id: inputRow.id,
      budget_period_id: inputRow.budgetPeriodId,
      date: inputRow.date,
      operation_type: inputRow.operationType,
      input_yen: inputRow.inputYen,
      before_total_yen: inputRow.beforeTotalYen,
      after_total_yen: inputRow.afterTotalYen,
      memo: inputRow.memo,
      created_at: inputRow.createdAt,
    });

  const listHistoriesByDateInternal = async (
    date: string,
    budgetPeriodId: string,
  ): Promise<DailyHistoryRecord[]> => {
    const rows = await database
      .select()
      .from(daily_operation_histories)
      .where(
        and(
          eq(daily_operation_histories.budget_period_id, budgetPeriodId),
          eq(daily_operation_histories.date, date),
        ),
      )
      .orderBy(desc(daily_operation_histories.created_at), sql`rowid DESC`)
      .all();
    return rows.map((row) => toDailyHistoryRecord(row));
  };

  return {
    listHistoriesByDate(date, budgetPeriodId) {
      return Effect.tryPromise({
        try: () => listHistoriesByDateInternal(date, budgetPeriodId),
        catch: toEffectError,
      });
    },

    insertHistory(inputRow) {
      return Effect.tryPromise({
        try: async () => {
          await buildInsertHistoryQuery(inputRow).run();
          return cloneHistory({
            id: inputRow.id,
            date: inputRow.date,
            budgetPeriodId: inputRow.budgetPeriodId,
            operationType: inputRow.operationType,
            inputYen: inputRow.inputYen,
            beforeTotalYen: inputRow.beforeTotalYen,
            afterTotalYen: inputRow.afterTotalYen,
            memo: inputRow.memo,
            createdAt: inputRow.createdAt,
          });
        },
        catch: toEffectError,
      });
    },

    hasEntriesOutsidePeriod(periodId, startDate, endDate) {
      return Effect.tryPromise({
        try: async () => {
          const [row] = await database
            .select({ id: daily_operation_histories.id })
            .from(daily_operation_histories)
            .where(
              and(
                eq(daily_operation_histories.budget_period_id, periodId),
                or(
                  lt(daily_operation_histories.date, startDate),
                  gt(daily_operation_histories.date, endDate),
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
