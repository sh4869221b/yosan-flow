import type { DatabaseTransaction } from "$lib/server/db/client";

export type DailyTotalRecord = {
  date: string;
  yearMonth: string;
  totalUsedYen: number;
  updatedAt: string;
};

export type DailyTotalUpsertInput = {
  date: string;
  yearMonth: string;
  totalUsedYen: number;
  nowIso: string;
};

export type DailyTotalTransaction = DatabaseTransaction<any, DailyTotalRecord, any>;

export interface DailyTotalRepository {
  findByDate(tx: DailyTotalTransaction, date: string): Promise<DailyTotalRecord | null>;
  upsertDailyTotal(
    tx: DailyTotalTransaction,
    input: DailyTotalUpsertInput
  ): Promise<DailyTotalRecord>;
}

function cloneDailyTotal(row: DailyTotalRecord): DailyTotalRecord {
  return { ...row };
}

export function createDailyTotalRepository(): DailyTotalRepository {
  return {
    async findByDate(tx, date) {
      const found = tx.state.dailyTotals.get(date);
      return found ? cloneDailyTotal(found) : null;
    },

    async upsertDailyTotal(tx, input) {
      const next: DailyTotalRecord = {
        date: input.date,
        yearMonth: input.yearMonth,
        totalUsedYen: input.totalUsedYen,
        updatedAt: input.nowIso
      };
      tx.state.dailyTotals.set(input.date, next);
      return cloneDailyTotal(next);
    }
  };
}
