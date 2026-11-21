import { Effect } from "effect";
import {
  createD1BudgetPeriodRepository,
  PeriodValidationError,
} from "#lib/server/db/budget-period-repository.ts";
import { createD1DailyHistoryRepository } from "#lib/server/db/daily-history-repository.ts";
import { createD1DailyTotalRepository } from "#lib/server/db/daily-total-repository.ts";
import { createD1DayEntryWriter } from "#lib/server/db/day-entry-writer.ts";
import { createDrizzleD1Database } from "#lib/server/db/client.ts";
import { day_entry_cutover } from "#lib/server/db/schema.ts";
import { toEffectError } from "#lib/server/effect/runtime.ts";
import type { D1Database } from "#lib/server/db/d1-types.ts";

export function createD1ApiServiceRepositories(db: D1Database) {
  const budgetPeriodRepository = createD1BudgetPeriodRepository({
    db,
  });
  const dailyTotalRepository = createD1DailyTotalRepository({
    db,
  });
  const dailyHistoryRepository = createD1DailyHistoryRepository({
    db,
  });
  const database = createDrizzleD1Database(db);
  const dayEntryWriter = createD1DayEntryWriter({
    db,
  });

  return {
    budgetPeriodRepository,
    dailyTotalRepository,
    dailyHistoryRepository,
    dayEntryWriter,
    getDayEntryEpoch: () =>
      Effect.tryPromise({
        try: async () => {
          const [row] = await database
            .select({ epoch: day_entry_cutover.epoch })
            .from(day_entry_cutover)
            .limit(1)
            .all();
          if (!row || !/^[0-9a-f]{32}$/.test(row.epoch))
            throw new Error("Day entry cutover has no valid epoch");
          return row.epoch;
        },
        catch: toEffectError,
      }),
  };
}

type D1ApiServiceRepositories = ReturnType<
  typeof createD1ApiServiceRepositories
>;

export function assertNoOutOfRangePeriodEntries(
  repositories: Pick<
    D1ApiServiceRepositories,
    "dailyTotalRepository" | "dailyHistoryRepository"
  >,
  periodId: string,
  startDate: string,
  endDate: string,
): Effect.Effect<void, Error> {
  return Effect.gen(function* () {
    const outOfRangeTotal =
      yield* repositories.dailyTotalRepository.hasEntriesOutsidePeriod(
        periodId,
        startDate,
        endDate,
      );
    const outOfRangeHistory =
      yield* repositories.dailyHistoryRepository.hasEntriesOutsidePeriod(
        periodId,
        startDate,
        endDate,
      );

    if (outOfRangeTotal || outOfRangeHistory) {
      return yield* Effect.fail(
        new PeriodValidationError(
          "PERIOD_HAS_OUT_OF_RANGE_ENTRIES",
          `period ${periodId} has entries outside the updated range`,
        ),
      );
    }
  });
}
