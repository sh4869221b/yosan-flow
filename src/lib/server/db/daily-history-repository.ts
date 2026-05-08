import { and, desc, eq, gt, lt, or } from "drizzle-orm";
import type { DatabaseTransaction } from "$lib/server/db/client";
import { createDrizzleD1Database } from "$lib/server/db/client";
import type { D1Database, D1PreparedStatement } from "$lib/server/db/d1-types";
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
  listHistoriesByDate(
    tx: DailyHistoryTransaction,
    date: string,
    budgetPeriodId: string,
  ): Promise<DailyHistoryRecord[]>;
  insertHistory(
    tx: DailyHistoryTransaction,
    input: InsertDailyHistoryInput,
  ): Promise<DailyHistoryRecord>;
}

export interface D1DailyHistoryRepository {
  listHistoriesByDate(
    date: string,
    budgetPeriodId: string,
  ): Promise<DailyHistoryRecord[]>;
  insertHistory(input: InsertDailyHistoryInput): Promise<DailyHistoryRecord>;
  prepareInsertHistory(input: InsertDailyHistoryInput): D1PreparedStatement;
  hasEntriesOutsidePeriod(
    periodId: string,
    startDate: string,
    endDate: string,
  ): Promise<boolean>;
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
  return {
    async listHistoriesByDate(tx, date, budgetPeriodId) {
      return tx.state.dailyOperationHistories
        .filter((entry) => {
          if (entry.date !== date) {
            return false;
          }
          if (entry.budgetPeriodId !== budgetPeriodId) {
            return false;
          }
          return true;
        })
        .slice()
        .sort((left, right) => {
          if (left.createdAt === right.createdAt) {
            return right.id.localeCompare(left.id);
          }
          return right.createdAt.localeCompare(left.createdAt);
        })
        .map((entry) => cloneHistory(entry));
    },

    async insertHistory(tx, input) {
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
  };
}

type CreateD1DailyHistoryRepositoryInput = {
  db: D1Database;
  ensureSchema?: () => Promise<void>;
};

export function createD1DailyHistoryRepository(
  input: CreateD1DailyHistoryRepositoryInput,
): D1DailyHistoryRepository {
  const ensureSchema = input.ensureSchema ?? (async () => {});
  const database = createDrizzleD1Database(input.db);

  const prepareInsertHistory = (
    inputRow: InsertDailyHistoryInput,
  ): D1PreparedStatement => {
    const query = database
      .insert(daily_operation_histories)
      .values({
        id: inputRow.id,
        budget_period_id: inputRow.budgetPeriodId,
        date: inputRow.date,
        operation_type: inputRow.operationType,
        input_yen: inputRow.inputYen,
        before_total_yen: inputRow.beforeTotalYen,
        after_total_yen: inputRow.afterTotalYen,
        memo: inputRow.memo,
        created_at: inputRow.createdAt,
      })
      .toSQL();
    return input.db.prepare(query.sql).bind(...query.params);
  };

  const listHistoriesByDateInternal = async (
    date: string,
    budgetPeriodId: string,
  ): Promise<DailyHistoryRecord[]> => {
    await ensureSchema();
    const rows = await database
      .select()
      .from(daily_operation_histories)
      .where(
        and(
          eq(daily_operation_histories.budget_period_id, budgetPeriodId),
          eq(daily_operation_histories.date, date),
        ),
      )
      .orderBy(
        desc(daily_operation_histories.created_at),
        desc(daily_operation_histories.id),
      )
      .all();
    return rows.map((row) => toDailyHistoryRecord(row));
  };

  return {
    async listHistoriesByDate(date, budgetPeriodId) {
      return listHistoriesByDateInternal(date, budgetPeriodId);
    },

    async insertHistory(inputRow) {
      await ensureSchema();
      await prepareInsertHistory(inputRow).run();
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

    prepareInsertHistory(inputRow) {
      return prepareInsertHistory(inputRow);
    },

    async hasEntriesOutsidePeriod(periodId, startDate, endDate) {
      await ensureSchema();
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
  };
}
