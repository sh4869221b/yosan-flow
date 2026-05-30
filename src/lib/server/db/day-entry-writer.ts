import { sql } from "drizzle-orm";
import { Effect } from "effect";
import { createDrizzleD1Database } from "$lib/server/db/client";
import type { D1Database } from "$lib/server/db/d1-types";
import { daily_operation_histories, daily_totals } from "$lib/server/db/schema";
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
  writeHistoryReplay(
    input:
      | {
          kind: "update";
          budgetPeriodId: string;
          date: string;
          yearMonth: string;
          nowIso: string;
          historyId: string;
          inputYen: number;
          memo: string | null;
        }
      | {
          kind: "delete";
          budgetPeriodId: string;
          date: string;
          yearMonth: string;
          nowIso: string;
          historyId: string;
        },
  ): Effect.Effect<void, Error>;
}

type CreateD1DayEntryWriterInput = {
  db: D1Database;
};

export function createD1DayEntryWriter(
  input: CreateD1DayEntryWriterInput,
): D1DayEntryWriter {
  const database = createDrizzleD1Database(input.db);

  return {
    writeDailyEntry({ total, history, mode }) {
      return Effect.tryPromise({
        try: async () => {
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

    writeHistoryReplay(command) {
      return Effect.tryPromise({
        try: async () => {
          const targetMutation =
            command.kind === "update"
              ? input.db
                  .prepare(
                    `
                    UPDATE daily_operation_histories
                    SET input_yen = ?, memo = ?
                    WHERE budget_period_id = ? AND date = ? AND id = ?
                    `,
                  )
                  .bind(
                    command.inputYen,
                    command.memo,
                    command.budgetPeriodId,
                    command.date,
                    command.historyId,
                  )
              : input.db
                  .prepare(
                    `
                    DELETE FROM daily_operation_histories
                    WHERE budget_period_id = ? AND date = ? AND id = ?
                    `,
                  )
                  .bind(
                    command.budgetPeriodId,
                    command.date,
                    command.historyId,
                  );

          await input.db.batch([
            targetMutation,
            input.db
              .prepare(
                `
                WITH RECURSIVE
                  ordered AS (
                    SELECT
                      id,
                      operation_type,
                      input_yen,
                      row_number() OVER (ORDER BY created_at ASC, id ASC) AS rn
                    FROM daily_operation_histories
                    WHERE budget_period_id = ? AND date = ?
                  ),
                  replay(rn, id, before_total_yen, after_total_yen) AS (
                    SELECT
                      rn,
                      id,
                      0,
                      input_yen
                    FROM ordered
                    WHERE rn = 1
                    UNION ALL
                    SELECT
                      ordered.rn,
                      ordered.id,
                      replay.after_total_yen,
                      CASE
                        WHEN ordered.operation_type = 'add'
                          THEN replay.after_total_yen + ordered.input_yen
                        ELSE ordered.input_yen
                      END
                    FROM replay
                    JOIN ordered ON ordered.rn = replay.rn + 1
                  )
                UPDATE daily_operation_histories
                SET
                  before_total_yen = (
                    SELECT before_total_yen
                    FROM replay
                    WHERE replay.id = daily_operation_histories.id
                  ),
                  after_total_yen = (
                    SELECT after_total_yen
                    FROM replay
                    WHERE replay.id = daily_operation_histories.id
                  )
                WHERE budget_period_id = ?
                  AND date = ?
                  AND id IN (SELECT id FROM replay)
                `,
              )
              .bind(
                command.budgetPeriodId,
                command.date,
                command.budgetPeriodId,
                command.date,
              ),
            input.db
              .prepare(
                `
                WITH RECURSIVE
                  ordered AS (
                    SELECT
                      id,
                      operation_type,
                      input_yen,
                      row_number() OVER (ORDER BY created_at ASC, id ASC) AS rn
                    FROM daily_operation_histories
                    WHERE budget_period_id = ? AND date = ?
                  ),
                  replay(rn, id, before_total_yen, after_total_yen) AS (
                    SELECT
                      rn,
                      id,
                      0,
                      input_yen
                    FROM ordered
                    WHERE rn = 1
                    UNION ALL
                    SELECT
                      ordered.rn,
                      ordered.id,
                      replay.after_total_yen,
                      CASE
                        WHEN ordered.operation_type = 'add'
                          THEN replay.after_total_yen + ordered.input_yen
                        ELSE ordered.input_yen
                      END
                    FROM replay
                    JOIN ordered ON ordered.rn = replay.rn + 1
                  )
                INSERT INTO daily_totals (
                  budget_period_id,
                  date,
                  year_month,
                  total_used_yen,
                  updated_at
                )
                SELECT
                  ?,
                  ?,
                  ?,
                  COALESCE(
                    (
                      SELECT after_total_yen
                      FROM replay
                      ORDER BY rn DESC
                      LIMIT 1
                    ),
                    0
                  ),
                  ?
                ON CONFLICT (budget_period_id, date) DO UPDATE SET
                  year_month = excluded.year_month,
                  total_used_yen = excluded.total_used_yen,
                  updated_at = excluded.updated_at
                `,
              )
              .bind(
                command.budgetPeriodId,
                command.date,
                command.budgetPeriodId,
                command.date,
                command.yearMonth,
                command.nowIso,
              ),
          ]);
        },
        catch: toEffectError,
      });
    },
  };
}
