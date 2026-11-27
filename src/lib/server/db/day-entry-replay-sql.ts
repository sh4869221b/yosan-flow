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
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { createDrizzleD1Database } from "#lib/server/db/client.ts";
import { prepareDayEntryStatement } from "#lib/server/db/day-entry-write-sql.ts";
import {
  invalidStoredHistoryYen,
  isStoredYen,
  maxStoredYen,
  otherDaysTotal,
} from "#lib/server/db/day-entry-yen-sql.ts";
import {
  daily_operation_histories_v2,
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
function buildReplayHistoryTotalsStatement(
  db: D1Database,
  command: D1DayEntryReplayCommand,
): D1PreparedStatement {
  const { budgetPeriodId, date, historyId } = command;
  const amount = command.kind === "update" ? command.inputYen : null;
  const deleting = command.kind === "delete" ? 1 : 0;
  const query = sql`
  WITH RECURSIVE
    target AS (
      SELECT rowid AS history_rowid, budget_period_id, date, input_yen AS target_amount
      FROM daily_operation_histories_v2
      WHERE budget_period_id = ${budgetPeriodId} AND date = ${date} AND id = ${historyId}
    ),
    ordered AS (
      SELECT
        rowid AS history_rowid,
        operation_type,
        CASE WHEN rowid = target.history_rowid THEN CAST(${amount} AS INTEGER) ELSE input_yen END AS input_yen,
        row_number() OVER (ORDER BY write_order ASC, rowid ASC) AS rn
      FROM daily_operation_histories_v2
      CROSS JOIN target
      WHERE daily_operation_histories_v2.budget_period_id = ${budgetPeriodId}
        AND daily_operation_histories_v2.date = ${date}
        AND (${deleting} = 0 OR rowid <> target.history_rowid)
        AND (${amount} IS NULL OR target.target_amount <> ${amount})
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
    ),
    invalid_replay AS MATERIALIZED (
      SELECT target.history_rowid FROM target
      WHERE EXISTS (
        SELECT 1 FROM daily_operation_histories_v2
        WHERE budget_period_id = target.budget_period_id AND date = target.date
          AND ${invalidStoredHistoryYen}
      ) OR EXISTS (
        SELECT 1 FROM daily_totals
        WHERE budget_period_id = target.budget_period_id AND date = target.date
          AND NOT ${isStoredYen(daily_totals.total_used_yen)}
      ) OR EXISTS (
        SELECT 1 FROM replay WHERE NOT ${isStoredYen(sql`replay.after_total_yen`)}
      ) OR ${otherDaysTotal(sql`target.budget_period_id`, sql`target.date`)} > ${maxStoredYen} - CASE
        WHEN ${amount} = target.target_amount THEN coalesce((
          SELECT total_used_yen FROM daily_totals
          WHERE budget_period_id = target.budget_period_id AND date = target.date
        ), 0)
        ELSE coalesce((SELECT after_total_yen FROM replay ORDER BY rn DESC LIMIT 1), 0)
      END
    ),
    replay_writes AS (
      SELECT history_rowid, before_total_yen, after_total_yen FROM replay
      WHERE NOT EXISTS (SELECT 1 FROM invalid_replay)
      UNION ALL
      SELECT history_rowid, NULL, 0 FROM invalid_replay
    )
    UPDATE daily_operation_histories_v2
    SET
      before_total_yen = replay_writes.before_total_yen,
      after_total_yen = replay_writes.after_total_yen
    FROM replay_writes
    WHERE daily_operation_histories_v2.rowid = CAST(replay_writes.history_rowid AS INTEGER)
      AND (
        replay_writes.before_total_yen IS NULL
        OR daily_operation_histories_v2.before_total_yen <> replay_writes.before_total_yen
        OR daily_operation_histories_v2.after_total_yen <> replay_writes.after_total_yen
      )
  `;
  // The CAST on the replay key lets SQLite seek directly to the history row.
  return prepareDayEntryStatement(db, {
    toSQL: () => new SQLiteSyncDialect().sqlToQuery(query),
  });
}

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
    eq(daily_operation_histories_v2.budget_period_id, command.budgetPeriodId),
    eq(daily_operation_histories_v2.date, command.date),
  );
}

function historyTarget(command: D1DayEntryReplayCommand) {
  return and(
    historyScope(command),
    eq(daily_operation_histories_v2.id, command.historyId),
  );
}

function remainingHistories(command: D1DayEntryReplayCommand) {
  return and(
    historyScope(command),
    command.kind === "delete"
      ? or(
          ne(daily_operation_histories_v2.id, command.historyId),
          isNull(daily_operation_histories_v2.id),
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
      .from(daily_operation_histories_v2)
      .where(
        and(
          historyTarget(command),
          command.kind === "update"
            ? ne(daily_operation_histories_v2.input_yen, command.inputYen)
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
          .update(daily_operation_histories_v2)
          .set({ input_yen: command.inputYen, memo: command.memo })
          .where(identity)
      : database.delete(daily_operation_histories_v2).where(identity),
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
            .from(daily_operation_histories_v2)
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
            total_used_yen: daily_operation_histories_v2.after_total_yen,
            updated_at: sql<string>`${command.nowIso}`.as("updated_at"),
          })
          .from(daily_operation_histories_v2)
          .where(
            and(remainingHistories(command), targetExists(database, command)),
          )
          .orderBy(
            desc(daily_operation_histories_v2.write_order),
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
