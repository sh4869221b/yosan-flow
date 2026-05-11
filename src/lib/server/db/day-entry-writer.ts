import { sql } from "drizzle-orm";
import { Effect } from "effect";
import { createDrizzleD1Database } from "$lib/server/db/client";
import type { D1Database } from "$lib/server/db/d1-types";
import {
  daily_operation_histories,
  daily_totals,
} from "$lib/server/db/schema";
import { toEffectError } from "$lib/server/effect/runtime";

type D1DayEntryWriteMode = "add" | "overwrite";

type D1DayEntryTotalWriteInput = {
  date: string;
  yearMonth: string;
  budgetPeriodId: string;
  totalUsedYen: number;
  nowIso: string;
};

type D1DayEntryHistoryWriteInput = {
  id: string;
  date: string;
  budgetPeriodId: string;
  operationType: D1DayEntryWriteMode;
  inputYen: number;
  beforeTotalYen: number;
  afterTotalYen: number;
  memo: string | null;
  createdAt: string;
};

export interface D1DayEntryWriter {
  writeDailyEntry(input: {
    total: D1DayEntryTotalWriteInput;
    history: D1DayEntryHistoryWriteInput;
    mode: D1DayEntryWriteMode;
  }): Effect.Effect<void, Error>;
}

type CreateD1DayEntryWriterInput = {
  db: D1Database;
  ensureSchema?: () => Promise<void>;
};

export function createD1DayEntryWriter(
  input: CreateD1DayEntryWriterInput,
): D1DayEntryWriter {
  const ensureSchema = input.ensureSchema ?? (async () => {});
  const database = createDrizzleD1Database(input.db);

  return {
    writeDailyEntry({ total, history, mode }) {
      return Effect.tryPromise({
        try: async () => {
          await ensureSchema();
          const nextTotal =
            mode === "add"
              ? sql`${daily_totals.total_used_yen} + excluded.total_used_yen`
              : sql`excluded.total_used_yen`;

          await database.batch([
            database
              .insert(daily_totals)
              .values({
                budget_period_id: total.budgetPeriodId,
                date: total.date,
                year_month: total.yearMonth,
                total_used_yen: total.totalUsedYen,
                updated_at: total.nowIso,
              })
              .onConflictDoUpdate({
                target: [daily_totals.budget_period_id, daily_totals.date],
                set: {
                  year_month: sql`excluded.year_month`,
                  total_used_yen: nextTotal,
                  updated_at: sql`excluded.updated_at`,
                },
              }),
            database.insert(daily_operation_histories).values({
              id: history.id,
              budget_period_id: history.budgetPeriodId,
              date: history.date,
              operation_type: history.operationType,
              input_yen: history.inputYen,
              before_total_yen: history.beforeTotalYen,
              after_total_yen: history.afterTotalYen,
              memo: history.memo,
              created_at: history.createdAt,
            }),
          ]);
        },
        catch: toEffectError,
      });
    },
  };
}
