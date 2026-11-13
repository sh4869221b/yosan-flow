import { and, desc, eq, notExists, sql } from "drizzle-orm";
import { createDrizzleD1Database } from "#lib/server/db/client.ts";
import { prepareDayEntryStatement } from "#lib/server/db/day-entry-write-sql.ts";
import {
  daily_operation_histories,
  daily_totals,
} from "#lib/server/db/schema.ts";
import type {
  D1Database,
  D1PreparedStatement,
} from "#lib/server/db/d1-types.ts";
import type { D1DayEntryReplayCommand } from "#lib/server/db/day-entry-writer-types.ts";

// Drizzle's SQLite builder has no recursive-CTE API. Keep this one replay
// expression in SQL: every row depends on the previous row's computed total.
// It must run inside the same D1 batch as the mutation, never as a JS read/write
// loop. Values remain bound, and rowid breaks created_at ties deterministically.
// Use rowid as the replay identity too: legacy TEXT PRIMARY KEY permits multiple
// NULL ids, which cannot match via equality or IN. Public mutations still use id.
const HISTORY_REPLAY_CTE = `
  WITH RECURSIVE
    ordered AS (
      SELECT
        rowid AS history_rowid,
        operation_type,
        input_yen,
        row_number() OVER (ORDER BY created_at ASC, rowid ASC) AS rn
      FROM daily_operation_histories
      WHERE budget_period_id = ? AND date = ?
    ),
    replay(rn, history_rowid, before_total_yen, after_total_yen) AS (
      SELECT
        rn,
        history_rowid,
        0,
        input_yen
      FROM ordered
      WHERE rn = 1
      UNION ALL
      SELECT
        ordered.rn,
        ordered.history_rowid,
        replay.after_total_yen,
        CASE
          WHEN ordered.operation_type = 'add'
            THEN replay.after_total_yen + ordered.input_yen
          ELSE ordered.input_yen
        END
      FROM replay
      JOIN ordered ON ordered.rn = replay.rn + 1
    )
`;

export function buildHistoryReplayStatements(
  db: D1Database,
  command: D1DayEntryReplayCommand,
): D1PreparedStatement[] {
  return [
    buildHistoryMutationStatement(db, command),
    buildReplayHistoryTotalsStatement(db, command),
    buildDailyTotalDeleteWhenHistoryEmptyStatement(db, command),
    buildReplayedDailyTotalUpsertStatement(db, command),
  ];
}

function buildHistoryMutationStatement(
  db: D1Database,
  command: D1DayEntryReplayCommand,
): D1PreparedStatement {
  const database = createDrizzleD1Database(db);
  const identity = and(
    eq(daily_operation_histories.budget_period_id, command.budgetPeriodId),
    eq(daily_operation_histories.date, command.date),
    eq(daily_operation_histories.id, command.historyId),
  );
  return prepareDayEntryStatement(
    db,
    command.kind === "update"
      ? database
          .update(daily_operation_histories)
          .set({ input_yen: command.inputYen, memo: command.memo })
          .where(identity)
      : database.delete(daily_operation_histories).where(identity),
  );
}

function buildReplayHistoryTotalsStatement(
  db: D1Database,
  command: D1DayEntryReplayCommand,
): D1PreparedStatement {
  return db
    .prepare(
      `
      ${HISTORY_REPLAY_CTE}
      UPDATE daily_operation_histories
      SET
        before_total_yen = (
          SELECT before_total_yen
          FROM replay
          WHERE replay.history_rowid = daily_operation_histories.rowid
        ),
        after_total_yen = (
          SELECT after_total_yen
          FROM replay
          WHERE replay.history_rowid = daily_operation_histories.rowid
        )
      WHERE budget_period_id = ?
        AND date = ?
        AND rowid IN (SELECT history_rowid FROM replay)
      `,
    )
    .bind(
      command.budgetPeriodId,
      command.date,
      command.budgetPeriodId,
      command.date,
    );
}

function buildDailyTotalDeleteWhenHistoryEmptyStatement(
  db: D1Database,
  command: D1DayEntryReplayCommand,
): D1PreparedStatement {
  const database = createDrizzleD1Database(db);
  return prepareDayEntryStatement(
    db,
    database.delete(daily_totals).where(
      and(
        eq(daily_totals.budget_period_id, command.budgetPeriodId),
        eq(daily_totals.date, command.date),
        notExists(
          database
            .select({ value: sql`1` })
            .from(daily_operation_histories)
            .where(
              and(
                eq(
                  daily_operation_histories.budget_period_id,
                  command.budgetPeriodId,
                ),
                eq(daily_operation_histories.date, command.date),
              ),
            ),
        ),
      ),
    ),
  );
}

function buildReplayedDailyTotalUpsertStatement(
  db: D1Database,
  command: D1DayEntryReplayCommand,
): D1PreparedStatement {
  // Earlier statements in this atomic batch have already persisted replay totals.
  const database = createDrizzleD1Database(db);
  return prepareDayEntryStatement(
    db,
    database
      .insert(daily_totals)
      .select(
        database
          .select({
            budget_period_id: sql<string>`${command.budgetPeriodId}`.as(
              "budget_period_id",
            ),
            date: sql<string>`${command.date}`.as("date"),
            year_month: sql<string>`${command.yearMonth}`.as("year_month"),
            total_used_yen: daily_operation_histories.after_total_yen,
            updated_at: sql<string>`${command.nowIso}`.as("updated_at"),
          })
          .from(daily_operation_histories)
          .where(
            and(
              eq(
                daily_operation_histories.budget_period_id,
                command.budgetPeriodId,
              ),
              eq(daily_operation_histories.date, command.date),
            ),
          )
          .orderBy(desc(daily_operation_histories.created_at), desc(sql`rowid`))
          .limit(1),
      )
      .onConflictDoUpdate({
        target: [daily_totals.budget_period_id, daily_totals.date],
        set: {
          year_month: sql`excluded.${sql.identifier(daily_totals.year_month.name)}`,
          total_used_yen: sql`excluded.${sql.identifier(daily_totals.total_used_yen.name)}`,
          updated_at: sql`excluded.${sql.identifier(daily_totals.updated_at.name)}`,
        },
      }),
  );
}
