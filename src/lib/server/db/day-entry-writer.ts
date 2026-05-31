import { Effect } from "effect";
import type { D1Database, D1PreparedStatement } from "$lib/server/db/d1-types";
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

type D1HistoryReplayCommand =
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
    };

const CURRENT_TOTAL_SQL = `
  COALESCE(
    (
      SELECT total_used_yen
      FROM daily_totals
      WHERE budget_period_id = ? AND date = ?
    ),
    0
  )
`;

export interface D1DayEntryWriter {
  writeDailyEntry(input: {
    total: D1DayEntryTotalWriteInput;
    history: D1DayEntryHistoryWriteInput;
    mode: D1DayEntryWriteMode;
  }): Effect.Effect<void, Error>;
  writeHistoryReplay(input: D1HistoryReplayCommand): Effect.Effect<void, Error>;
}

type CreateD1DayEntryWriterInput = {
  db: D1Database;
};

function buildAfterTotalSql(mode: D1DayEntryWriteMode): string {
  return mode === "add" ? `${CURRENT_TOTAL_SQL} + ?` : "?";
}

function prepareInsertHistoryStatement(input: {
  db: D1Database;
  history: D1DayEntryHistoryWriteInput;
  mode: D1DayEntryWriteMode;
}): D1PreparedStatement {
  const { db, history, mode } = input;
  const afterTotalSql = buildAfterTotalSql(mode);
  const afterTotalBindings =
    mode === "add"
      ? [history.budgetPeriodId, history.date, history.inputYen]
      : [history.inputYen];

  return db
    .prepare(
      `
      INSERT INTO daily_operation_histories (
        id,
        budget_period_id,
        date,
        operation_type,
        input_yen,
        before_total_yen,
        after_total_yen,
        memo,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ${CURRENT_TOTAL_SQL}, ${afterTotalSql}, ?, ?)
    `,
    )
    .bind(
      history.id,
      history.budgetPeriodId,
      history.date,
      history.operationType,
      history.inputYen,
      history.budgetPeriodId,
      history.date,
      ...afterTotalBindings,
      history.memo,
      history.createdAt,
    );
}

function prepareUpsertDailyTotalStatement(input: {
  db: D1Database;
  total: D1DayEntryTotalWriteInput;
  mode: D1DayEntryWriteMode;
}): D1PreparedStatement {
  const { db, total, mode } = input;

  return db
    .prepare(
      `
      INSERT INTO daily_totals (
        budget_period_id,
        date,
        year_month,
        total_used_yen,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (budget_period_id, date) DO UPDATE SET
        year_month = excluded.year_month,
        total_used_yen = ${
          mode === "add"
            ? "daily_totals.total_used_yen + excluded.total_used_yen"
            : "excluded.total_used_yen"
        },
        updated_at = excluded.updated_at
    `,
    )
    .bind(
      total.budgetPeriodId,
      total.date,
      total.yearMonth,
      total.totalUsedYen,
      total.nowIso,
    );
}

function prepareHistoryMutationStatement(input: {
  db: D1Database;
  command: D1HistoryReplayCommand;
}): D1PreparedStatement {
  const { db, command } = input;

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

function prepareReplayHistoryTotalsStatement(input: {
  db: D1Database;
  command: D1HistoryReplayCommand;
}): D1PreparedStatement {
  const { db, command } = input;

  return db
    .prepare(
      `
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

function prepareDeleteDailyTotalWithoutHistoryStatement(input: {
  db: D1Database;
  command: D1HistoryReplayCommand;
}): D1PreparedStatement {
  const { db, command } = input;

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

function prepareUpsertReplayedDailyTotalStatement(input: {
  db: D1Database;
  command: D1HistoryReplayCommand;
}): D1PreparedStatement {
  const { db, command } = input;

  return db
    .prepare(
      `
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

export function createD1DayEntryWriter(
  input: CreateD1DayEntryWriterInput,
): D1DayEntryWriter {
  return {
    writeDailyEntry({ total, history, mode }) {
      return Effect.tryPromise({
        try: async () => {
          await input.db.batch([
            prepareInsertHistoryStatement({ db: input.db, history, mode }),
            prepareUpsertDailyTotalStatement({ db: input.db, total, mode }),
          ]);
        },
        catch: toEffectError,
      });
    },

    writeHistoryReplay(command) {
      return Effect.tryPromise({
        try: async () => {
          await input.db.batch([
            prepareHistoryMutationStatement({ db: input.db, command }),
            prepareReplayHistoryTotalsStatement({ db: input.db, command }),
            prepareDeleteDailyTotalWithoutHistoryStatement({
              db: input.db,
              command,
            }),
            prepareUpsertReplayedDailyTotalStatement({ db: input.db, command }),
          ]);
        },
        catch: toEffectError,
      });
    },
  };
}
