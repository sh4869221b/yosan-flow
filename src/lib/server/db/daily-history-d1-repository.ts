import { and, desc, eq, gt, lt, or, sql } from "drizzle-orm";
import { Effect } from "effect";
import { createDrizzleD1Database } from "$lib/server/db/client";
import type { D1Database } from "$lib/server/db/d1-types";
import {
  cloneHistory,
  toDailyHistoryInsertValues,
  toDailyHistoryRecord,
  toDailyHistoryRecordFromInput,
} from "$lib/server/db/daily-history-mapper";
import type {
  D1DailyHistoryRepository,
  InsertDailyHistoryInput,
} from "$lib/server/db/daily-history-types";
import { daily_operation_histories } from "$lib/server/db/schema";
import { toEffectError } from "$lib/server/effect/runtime";

type CreateD1DailyHistoryRepositoryInput = {
  db: D1Database;
};

export function createD1DailyHistoryRepository(
  input: CreateD1DailyHistoryRepositoryInput,
): D1DailyHistoryRepository {
  const database = createDrizzleD1Database(input.db);

  const buildInsertHistoryQuery = (inputRow: InsertDailyHistoryInput) =>
    database
      .insert(daily_operation_histories)
      .values(toDailyHistoryInsertValues(inputRow));

  const listHistoriesByDateInternal = async (
    date: string,
    budgetPeriodId: string,
  ) => {
    const rows = await database
      .select()
      .from(daily_operation_histories)
      .where(
        and(
          eq(daily_operation_histories.budget_period_id, budgetPeriodId),
          eq(daily_operation_histories.date, date),
        ),
      )
      .orderBy(desc(daily_operation_histories.created_at), sql`rowid DESC`)
      .all();
    return rows.map((row) => toDailyHistoryRecord(row));
  };

  return {
    listHistoriesByDate(date, budgetPeriodId) {
      return Effect.tryPromise({
        try: () => listHistoriesByDateInternal(date, budgetPeriodId),
        catch: toEffectError,
      });
    },

    insertHistory(inputRow) {
      return Effect.tryPromise({
        try: async () => {
          await buildInsertHistoryQuery(inputRow).run();
          return cloneHistory(toDailyHistoryRecordFromInput(inputRow));
        },
        catch: toEffectError,
      });
    },

    hasEntriesOutsidePeriod(periodId, startDate, endDate) {
      return Effect.tryPromise({
        try: async () => {
          const [row] = await database
            .select({ id: daily_operation_histories.id })
            .from(daily_operation_histories)
            .where(
              and(
                eq(daily_operation_histories.budget_period_id, periodId),
                or(
                  lt(daily_operation_histories.date, startDate),
                  gt(daily_operation_histories.date, endDate),
                ),
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
