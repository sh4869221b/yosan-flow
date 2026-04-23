import type { DatabaseTransaction } from "$lib/server/db/client";

export type DailyTotalRecord = {
  date: string;
  yearMonth: string;
  budgetPeriodId: string;
  totalUsedYen: number;
  updatedAt: string;
};

export type DailyTotalUpsertInput = {
  date: string;
  yearMonth: string;
  budgetPeriodId: string;
  totalUsedYen: number;
  nowIso: string;
};

export type DailyTotalTransaction = DatabaseTransaction<any, DailyTotalRecord, any>;

export interface DailyTotalRepository {
  findByDate(tx: DailyTotalTransaction, date: string, budgetPeriodId: string): Promise<DailyTotalRecord | null>;
  upsertDailyTotal(
    tx: DailyTotalTransaction,
    input: DailyTotalUpsertInput
  ): Promise<DailyTotalRecord>;
}

function cloneDailyTotal(row: DailyTotalRecord): DailyTotalRecord {
  return { ...row };
}

function toDailyTotalKey(date: string, budgetPeriodId: string): string {
  return `${budgetPeriodId}:${date}`;
}

export function createDailyTotalRepository(): DailyTotalRepository {
  return {
    async findByDate(tx, date, budgetPeriodId) {
      const found = tx.state.dailyTotals.get(toDailyTotalKey(date, budgetPeriodId));
      if (!found) {
        return null;
      }
      if (found.budgetPeriodId !== budgetPeriodId) {
        return null;
      }
      return cloneDailyTotal(found);
    },

    async upsertDailyTotal(tx, input) {
      const next: DailyTotalRecord = {
        date: input.date,
        yearMonth: input.yearMonth,
        budgetPeriodId: input.budgetPeriodId,
        totalUsedYen: input.totalUsedYen,
        updatedAt: input.nowIso
      };
      tx.state.dailyTotals.set(toDailyTotalKey(input.date, input.budgetPeriodId), next);
      return cloneDailyTotal(next);
    }
  };
}
