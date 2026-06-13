import { Effect } from "effect";
import type { BudgetPeriodRepository } from "$lib/server/db/budget-period-repository";
import type { D1DailyHistoryRepository } from "$lib/server/db/daily-history-repository";
import type { D1DailyTotalRepository } from "$lib/server/db/daily-total-repository";
import { PeriodNotFoundError } from "./types";

export function listPeriodDailyTotals(
  dailyTotalRepository: D1DailyTotalRepository,
  periodId: string,
) {
  return dailyTotalRepository.listByPeriodId(periodId).pipe(
    Effect.map((rows) =>
      rows.map((row) => ({
        date: row.date,
        budgetPeriodId: row.budgetPeriodId,
        totalUsedYen: row.totalUsedYen,
      })),
    ),
  );
}

export function listPeriodHistoryByDate(
  repositories: {
    readonly budgetPeriodRepository: BudgetPeriodRepository;
    readonly dailyHistoryRepository: D1DailyHistoryRepository;
  },
  periodId: string,
  date: string,
) {
  return Effect.gen(function* () {
    const period =
      yield* repositories.budgetPeriodRepository.findById(periodId);
    if (!period) {
      return yield* Effect.fail(new PeriodNotFoundError(periodId));
    }
    return yield* repositories.dailyHistoryRepository.listHistoriesByDate(
      date,
      periodId,
    );
  });
}
