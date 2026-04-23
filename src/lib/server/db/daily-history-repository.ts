import type { DatabaseTransaction } from "$lib/server/db/client";

export type DailyOperationType = "add" | "overwrite";

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

export type InsertDailyHistoryInput = {
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

export type DailyHistoryTransaction = DatabaseTransaction<any, any, DailyHistoryRecord>;

export interface DailyHistoryRepository {
  listHistoriesByDate(tx: DailyHistoryTransaction, date: string, budgetPeriodId: string): Promise<DailyHistoryRecord[]>;
  insertHistory(
    tx: DailyHistoryTransaction,
    input: InsertDailyHistoryInput
  ): Promise<DailyHistoryRecord>;
}

function cloneHistory(row: DailyHistoryRecord): DailyHistoryRecord {
  return { ...row };
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
        createdAt: input.createdAt
      };
      tx.state.dailyOperationHistories.push(history);
      return cloneHistory(history);
    }
  };
}
