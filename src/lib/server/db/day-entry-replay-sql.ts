import {
  and,
  desc,
  eq,
  exists,
  ne,
  notExists,
  or,
  isNull,
  sql,
} from "drizzle-orm";
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
// loop. Replay uses the order assigned in the write transaction.
// Use rowid as the replay identity too: legacy TEXT PRIMARY KEY permits multiple
// NULL ids, which cannot match via equality or IN. Public mutations still use id.
const HISTORY_REPLAY_CTE = `
  WITH RECURSIVE
    target AS (
      SELECT rowid AS history_rowid, input_yen AS target_amount FROM daily_operation_histories
      WHERE budget_period_id = ? AND date = ? AND id = ?
    ),
    ordered AS (
      SELECT
        rowid AS history_rowid,
        operation_type,
        CASE WHEN rowid = target.history_rowid THEN ? ELSE input_yen END AS input_yen,
        row_number() OVER (ORDER BY coalesce(nullif(write_order, 0), rowid) ASC, rowid ASC) AS rn
      FROM daily_operation_histories
      CROSS JOIN target
      WHERE budget_period_id = ? AND date = ?
        AND (? = 0 OR rowid <> target.history_rowid)
        AND (? IS NULL OR target.target_amount <> ?)
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
  // Replay the planned change while its target is still present. Every write
  // is scoped to that target, and the last statement provides its affected count.
  return [
    buildReplayHistoryTotalsStatement(db, command),
    buildDailyTotalDeleteWhenHistoryEmptyStatement(db, command),
    buildReplayedDailyTotalUpsertStatement(db, command),
    buildHistoryMutationStatement(db, command),
  ];
}

function historyScope(command: D1DayEntryReplayCommand) {
  return and(
    eq(daily_operation_histories.budget_period_id, command.budgetPeriodId),
    eq(daily_operation_histories.date, command.date),
  );
}

function historyTarget(command: D1DayEntryReplayCommand) {
  return and(
    historyScope(command),
    eq(daily_operation_histories.id, command.historyId),
  );
}

function remainingHistories(command: D1DayEntryReplayCommand) {
  return and(
    historyScope(command),
    command.kind === "delete"
      ? or(
          ne(daily_operation_histories.id, command.historyId),
          isNull(daily_operation_histories.id),
        )
      : undefined,
  );
}

function targetExists(
  database: ReturnType<typeof createDrizzleD1Database>,
  command: D1DayEntryReplayCommand,
) {
  return exists(
    database
      .select({ value: sql`1` })
      .from(daily_operation_histories)
      .where(
        and(
          historyTarget(command),
          command.kind === "update"
            ? ne(daily_operation_histories.input_yen, command.inputYen)
            : undefined,
        ),
      ),
  );
}

function buildHistoryMutationStatement(
  db: D1Database,
  command: D1DayEntryReplayCommand,
): D1PreparedStatement {
  const database = createDrizzleD1Database(db);
  const identity = historyTarget(command);
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
  const amount = command.kind === "update" ? command.inputYen : null;
  // Casting the replay key steers SQLite toward indexed rowid lookups on the
  // history table instead of scanning unrelated histories to probe replay.
  return db
    .prepare(
      `
      ${HISTORY_REPLAY_CTE}
      UPDATE daily_operation_histories
      SET
        before_total_yen = replay.before_total_yen,
        after_total_yen = replay.after_total_yen
      FROM replay
      WHERE daily_operation_histories.rowid = CAST(replay.history_rowid AS INTEGER)
        AND (
          daily_operation_histories.before_total_yen <> replay.before_total_yen
          OR daily_operation_histories.after_total_yen <> replay.after_total_yen
        )
      `,
    )
    .bind(
      command.budgetPeriodId,
      command.date,
      command.historyId,
      amount,
      command.budgetPeriodId,
      command.date,
      command.kind === "delete" ? 1 : 0,
      amount,
      amount,
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
        targetExists(database, command),
        notExists(
          database
            .select({ value: sql`1` })
            .from(daily_operation_histories)
            .where(remainingHistories(command)),
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
            and(remainingHistories(command), targetExists(database, command)),
          )
          .orderBy(
            desc(
              sql`coalesce(nullif(${daily_operation_histories.write_order}, 0), rowid)`,
            ),
            desc(sql`rowid`),
          )
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
