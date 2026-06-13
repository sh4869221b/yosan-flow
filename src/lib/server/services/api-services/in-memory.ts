import { Effect } from "effect";
import { createInMemoryDatabaseClient } from "$lib/server/db/client";
import {
  createInMemoryBudgetPeriodRepository,
  PeriodValidationError,
  type BudgetPeriodRecord,
} from "$lib/server/db/budget-period-repository";
import {
  createDailyHistoryRepository,
  type DailyHistoryRecord,
} from "$lib/server/db/daily-history-repository";
import {
  createDailyTotalRepository,
  type DailyTotalRecord,
} from "$lib/server/db/daily-total-repository";
import { isDateWithinPeriod } from "$lib/server/domain/budget-period";
import { toEffectError } from "$lib/server/effect/runtime";
import {
  DayEntryService,
  PeriodNotFoundError,
} from "$lib/server/services/day-entry-service";
import { getJstDateParts } from "$lib/server/time/jst";
import type {
  CreateInMemoryApiServicesInput,
  InMemoryApiServicesWithInternals,
} from "./types";

export function createInMemoryApiServices(
  input: CreateInMemoryApiServicesInput = {},
): InMemoryApiServicesWithInternals {
  const now = input.now ?? (() => new Date());
  const databaseClient = createInMemoryDatabaseClient<
    BudgetPeriodRecord,
    DailyTotalRecord,
    DailyHistoryRecord
  >();
  const dailyTotalRepository = createDailyTotalRepository();
  const dailyHistoryRepository = createDailyHistoryRepository();
  const budgetPeriodRepository = createInMemoryBudgetPeriodRepository();

  let mutationQueue: Promise<void> = Promise.resolve();
  function runSerializedEffect<T>(
    work: () => Effect.Effect<T, Error>,
  ): Effect.Effect<T, Error> {
    return Effect.gen(function* () {
      const pending = mutationQueue;
      let releaseQueue: (() => void) | undefined;
      mutationQueue = new Promise<void>((resolve) => {
        releaseQueue = resolve;
      });

      yield* Effect.tryPromise({
        try: () => pending,
        catch: toEffectError,
      });

      return yield* work().pipe(
        Effect.ensuring(
          Effect.sync(() => {
            releaseQueue?.();
          }),
        ),
      );
    });
  }

  const rawDayEntryService = new DayEntryService({
    databaseClient,
    budgetPeriodRepository,
    dailyTotalRepository,
    dailyHistoryRepository,
    now: () => now().toISOString(),
    createHistoryId: input.createHistoryId,
  });

  function assertNoOutOfRangePeriodEntries(
    periodId: string,
    startDate: string,
    endDate: string,
  ): Effect.Effect<void, Error> {
    return Effect.gen(function* () {
      const hasOutOfRangeEntries = yield* databaseClient.read((tx) =>
        Effect.succeed(
          [...tx.state.dailyTotals.values()].some(
            (row) =>
              row.budgetPeriodId === periodId &&
              !isDateWithinPeriod(row.date, startDate, endDate),
          ) ||
            tx.state.dailyOperationHistories.some(
              (row) =>
                row.budgetPeriodId === periodId &&
                !isDateWithinPeriod(row.date, startDate, endDate),
            ),
        ),
      );

      if (hasOutOfRangeEntries) {
        return yield* Effect.fail(
          new PeriodValidationError(
            "PERIOD_HAS_OUT_OF_RANGE_ENTRIES",
            `period ${periodId} has entries outside the updated range`,
          ),
        );
      }
    });
  }

  return {
    databaseClient,
    budgetPeriodRepository,
    dailyTotalRepository,
    dailyHistoryRepository,
    dayEntryService: {
      addDailyAmount: (command) =>
        runSerializedEffect(() => rawDayEntryService.addDailyAmount(command)),
      overwriteDailyAmount: (command) =>
        runSerializedEffect(() =>
          rawDayEntryService.overwriteDailyAmount(command),
        ),
      updateHistoryEntry: (command) =>
        runSerializedEffect(() =>
          rawDayEntryService.updateHistoryEntry(command),
        ),
      deleteHistoryEntry: (command) =>
        runSerializedEffect(() =>
          rawDayEntryService.deleteHistoryEntry(command),
        ),
    },
    createPeriod: (periodInput) =>
      runSerializedEffect(() =>
        budgetPeriodRepository.createPeriod({
          ...periodInput,
          nowIso: now().toISOString(),
        }),
      ),
    updatePeriod: (periodInput) =>
      runSerializedEffect(() =>
        Effect.gen(function* () {
          yield* assertNoOutOfRangePeriodEntries(
            periodInput.id,
            periodInput.startDate,
            periodInput.endDate,
          );

          return yield* budgetPeriodRepository.updatePeriod({
            ...periodInput,
            nowIso: now().toISOString(),
          });
        }),
      ),
    listPeriods: () => budgetPeriodRepository.listPeriods(),
    listDailyTotalsByPeriodId: (periodId) =>
      databaseClient.read((tx) =>
        Effect.succeed(
          [...tx.state.dailyTotals.values()]
            .filter((row) => row.budgetPeriodId === periodId)
            .map((row) => ({
              date: row.date,
              budgetPeriodId: row.budgetPeriodId,
              totalUsedYen: row.totalUsedYen,
            }))
            .sort((left, right) => left.date.localeCompare(right.date)),
        ),
      ),
    listHistoryByDate: (periodId, date) =>
      Effect.gen(function* () {
        const period = yield* budgetPeriodRepository.findById(periodId);
        if (!period) {
          return yield* Effect.fail(new PeriodNotFoundError(periodId));
        }
        return yield* databaseClient.read((tx) =>
          dailyHistoryRepository.listHistoriesByDate(tx, date, periodId),
        );
      }),
    nowIso: () => now().toISOString(),
    jstToday: () => getJstDateParts(now()).date,
  };
}
