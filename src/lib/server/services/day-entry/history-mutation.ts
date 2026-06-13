import { Effect } from "effect";
import type { DatabaseClient } from "$lib/server/db/client";
import type {
  BudgetPeriodRecord,
  BudgetPeriodRepository,
} from "$lib/server/db/budget-period-repository";
import type {
  DailyHistoryRecord,
  DailyHistoryRepository,
} from "$lib/server/db/daily-history-repository";
import type {
  DailyTotalRecord,
  DailyTotalRepository,
} from "$lib/server/db/daily-total-repository";
import { replayDailyHistories } from "./replay";
import { validatePeriodDateEffect } from "./preparation";
import {
  createEmptyHistoryReplayResult,
  createHistoryReplayResult,
  type HistoryReplayResultShape,
} from "./result-shaping";

type HistoryMutationCommandLike = {
  periodId: string;
  date: string;
  historyId: string;
};

type HistoryMutationErrors = {
  createPeriodNotFoundError: (periodId: string) => Error;
  createDateOutOfPeriodError: (date: string, periodId: string) => Error;
  createHistoryNotFoundError: (historyId: string) => Error;
};

type ReplayHistoryMutationInput = {
  command: HistoryMutationCommandLike;
  databaseClient: DatabaseClient<
    BudgetPeriodRecord,
    DailyTotalRecord,
    DailyHistoryRecord
  >;
  budgetPeriodRepository: BudgetPeriodRepository;
  dailyTotalRepository: DailyTotalRepository;
  dailyHistoryRepository: DailyHistoryRepository;
  now: () => string;
  mutateTarget: (history: DailyHistoryRecord) => DailyHistoryRecord | null;
  errors: HistoryMutationErrors;
};

export function replayHistoryMutationEffect(
  input: ReplayHistoryMutationInput,
): Effect.Effect<HistoryReplayResultShape, Error> {
  return input.databaseClient.transaction((tx) =>
    Effect.gen(function* () {
      const period = yield* input.budgetPeriodRepository.findById(
        input.command.periodId,
      );
      if (!period) {
        return yield* Effect.fail(
          input.errors.createPeriodNotFoundError(input.command.periodId),
        );
      }
      yield* validatePeriodDateEffect({
        date: input.command.date,
        period,
        createDateOutOfPeriodError: input.errors.createDateOutOfPeriodError,
      });

      const target = yield* input.dailyHistoryRepository.findHistoryById(tx, {
        budgetPeriodId: period.id,
        date: input.command.date,
        historyId: input.command.historyId,
      });
      if (!target) {
        return yield* Effect.fail(
          input.errors.createHistoryNotFoundError(input.command.historyId),
        );
      }

      const existingHistories =
        yield* input.dailyHistoryRepository.listHistoriesByDateChronological(
          tx,
          input.command.date,
          period.id,
        );
      const mutatedHistories = existingHistories.flatMap((history) => {
        if (history.id !== input.command.historyId) {
          return [history];
        }
        const next = input.mutateTarget(history);
        return next ? [next] : [];
      });
      const replayed = replayDailyHistories(mutatedHistories);

      yield* input.dailyHistoryRepository.replaceHistoriesForDate(tx, {
        budgetPeriodId: period.id,
        date: input.command.date,
        histories: replayed.histories,
      });
      const nowIso = input.now();
      if (replayed.histories.length === 0) {
        yield* input.dailyTotalRepository.deleteDailyTotal(tx, {
          date: input.command.date,
          budgetPeriodId: period.id,
        });
        return createEmptyHistoryReplayResult({
          date: input.command.date,
          budgetPeriodId: period.id,
          updatedAt: nowIso,
        });
      }

      const dailyTotal = yield* input.dailyTotalRepository.setDailyTotal(tx, {
        date: input.command.date,
        yearMonth: input.command.date.slice(0, 7),
        budgetPeriodId: period.id,
        totalUsedYen: replayed.finalTotalYen,
        nowIso,
      });

      return createHistoryReplayResult({
        dailyTotal,
        histories: replayed.histories,
      });
    }),
  );
}
