import { and, desc, eq, sql } from "drizzle-orm";
import { Effect } from "effect";
import { buildD1BudgetPeriodByIdQuery } from "#lib/server/db/budget-period-d1-query.ts";
import { assertValidBudgetPeriodRow } from "#lib/server/db/budget-period-row-mapper.ts";
import { createDrizzleD1Database } from "#lib/server/db/client.ts";
import { dailyEntryOutsideRange } from "#lib/server/db/daily-entry-range-query.ts";
import type { D1Database } from "#lib/server/db/d1-types.ts";
import { toDailyHistoryRecord } from "#lib/server/db/daily-history-mapper.ts";
import type { D1DailyHistoryRepository } from "#lib/server/db/daily-history-types.ts";
import { daily_operation_histories_v2 } from "#lib/server/db/schema.ts";
import { toEffectError } from "#lib/server/effect/runtime.ts";

type CreateD1DailyHistoryRepositoryInput = {
  db: D1Database;
};

export function createD1DailyHistoryRepository(
  input: CreateD1DailyHistoryRepositoryInput,
): D1DailyHistoryRepository {
  const database = createDrizzleD1Database(input.db);
  const buildHistoryQuery = (date: string, budgetPeriodId: string) =>
    database
      .select()
      .from(daily_operation_histories_v2)
      .where(
        and(
          eq(daily_operation_histories_v2.budget_period_id, budgetPeriodId),
          eq(daily_operation_histories_v2.date, date),
        ),
      )
      .orderBy(
        desc(daily_operation_histories_v2.write_order),
        desc(sql`rowid`),
      );

  return {
    listHistoriesByDate(date, budgetPeriodId) {
      return Effect.tryPromise({
        try: async () => {
          const rows = await buildHistoryQuery(date, budgetPeriodId).all();
          return rows.map((row) => toDailyHistoryRecord(row));
        },
        catch: toEffectError,
      });
    },

    listHistoriesByDateForExistingPeriod(date, budgetPeriodId) {
      return Effect.tryPromise({
        try: async () => {
          const [[period], rows] = await database.batch([
            buildD1BudgetPeriodByIdQuery(database, budgetPeriodId),
            buildHistoryQuery(date, budgetPeriodId),
          ]);
          if (!period) return null;
          assertValidBudgetPeriodRow(period);
          return rows.map((row) => toDailyHistoryRecord(row));
        },
        catch: toEffectError,
      });
    },

    hasEntriesOutsidePeriod(periodId, startDate, endDate) {
      return Effect.tryPromise({
        try: async () => {
          const [row] = await database
            .select({ id: daily_operation_histories_v2.id })
            .from(daily_operation_histories_v2)
            .where(
              dailyEntryOutsideRange(
                daily_operation_histories_v2,
                periodId,
                startDate,
                endDate,
              ),
            )
            .limit(1)
            .all();
          return Boolean(row);
        },
        catch: toEffectError,
      });
    },
  };
}
