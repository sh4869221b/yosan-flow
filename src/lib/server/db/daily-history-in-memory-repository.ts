import { Effect } from "effect";
import { toDailyHistoryRecordFromInput } from "#lib/server/db/daily-history-mapper.ts";
import type {
  DailyHistoryRecord,
  DailyHistoryRepository,
  DailyHistoryTransaction,
} from "#lib/server/db/daily-history-types.ts";
import { toEffectError } from "#lib/server/effect/runtime.ts";

function findChronologicalHistories(
  tx: DailyHistoryTransaction,
  date: string,
  budgetPeriodId: string,
): DailyHistoryRecord[] {
  return tx.state.dailyOperationHistories
    .filter(
      (entry) => entry.date === date && entry.budgetPeriodId === budgetPeriodId,
    )
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
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
          return found ? { ...found } : null;
        },
        catch: toEffectError,
      });
    },

    listHistoriesByDate(tx, date, budgetPeriodId) {
      return Effect.try({
        try: () =>
          findChronologicalHistories(tx, date, budgetPeriodId)
            .reverse()
            .map((entry) => ({ ...entry })),
        catch: toEffectError,
      });
    },

    listHistoriesByDateChronological(tx, date, budgetPeriodId) {
      return Effect.try({
        try: () =>
          findChronologicalHistories(tx, date, budgetPeriodId).map((entry) => ({
            ...entry,
          })),
        catch: toEffectError,
      });
    },

    insertHistory(tx, input) {
      return Effect.try({
        try: () => {
          const history = toDailyHistoryRecordFromInput(input);
          tx.state.dailyOperationHistories.push(history);
          return { ...history };
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
            ...input.histories.map((history) => ({ ...history })),
          );
        },
        catch: toEffectError,
      });
    },
  };
}
