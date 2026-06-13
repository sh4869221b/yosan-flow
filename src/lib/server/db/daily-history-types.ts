import { Effect } from "effect";
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

export type DailyHistoryTransaction = DatabaseTransaction<
  unknown,
  unknown,
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
