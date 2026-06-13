import { Effect } from "effect";
import {
  cloneHistory,
  toDailyHistoryRecordFromInput,
} from "$lib/server/db/daily-history-mapper";
import type {
  DailyHistoryRecord,
  DailyHistoryRepository,
  DailyHistoryTransaction,
} from "$lib/server/db/daily-history-types";
import { toEffectError } from "$lib/server/effect/runtime";

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

export function createDailyHistoryRepository(): DailyHistoryRepository {
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
          const history = toDailyHistoryRecordFromInput(input);
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
