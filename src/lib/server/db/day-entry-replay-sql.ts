import type { D1Database, D1PreparedStatement } from "$lib/server/db/d1-types";
import type { D1DayEntryReplayCommand } from "$lib/server/db/day-entry-writer-types";

const HISTORY_REPLAY_CTE = `
  WITH RECURSIVE
    ordered AS (
      SELECT
        id,
        operation_type,
        input_yen,
        row_number() OVER (ORDER BY created_at ASC, rowid ASC) AS rn
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
  if (command.kind === "update") {
    return db
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
      );
  }

  return db
    .prepare(
      `
      DELETE FROM daily_operation_histories
      WHERE budget_period_id = ? AND date = ? AND id = ?
      `,
    )
    .bind(command.budgetPeriodId, command.date, command.historyId);
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
    );
}

function buildDailyTotalDeleteWhenHistoryEmptyStatement(
  db: D1Database,
  command: D1DayEntryReplayCommand,
): D1PreparedStatement {
  return db
    .prepare(
      `
      DELETE FROM daily_totals
      WHERE budget_period_id = ?
        AND date = ?
        AND NOT EXISTS (
          SELECT 1
          FROM daily_operation_histories
          WHERE budget_period_id = ? AND date = ?
        )
      `,
    )
    .bind(
      command.budgetPeriodId,
      command.date,
      command.budgetPeriodId,
      command.date,
    );
}

function buildReplayedDailyTotalUpsertStatement(
  db: D1Database,
  command: D1DayEntryReplayCommand,
): D1PreparedStatement {
  return db
    .prepare(
      `
      ${HISTORY_REPLAY_CTE}
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
        after_total_yen,
        ?
      FROM replay
      WHERE true
      ORDER BY rn DESC
      LIMIT 1
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
    );
}
