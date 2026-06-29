import { describe, expect, it } from "vitest";
import { applyDailyOperationHistoryMutation } from "./period-d1-fake-modules/daily-operation-history-mutations";
import { applySqlMutation } from "./period-d1-fake-modules/sql-dispatch";
import {
  createPeriodAwareD1FakeState,
  toDailyTotalKey,
} from "./period-d1-fake-modules/table-state";
import type {
  DailyOperationHistoryRow,
  DailyTotalRow,
} from "./period-d1-fake-modules/types";

const PERIOD_ID = "period-a";
const DATE = "2026-04-20";
const UPDATE_SQL = "UPDATE daily_operation_histories SET input_yen = ?";
const DELETE_SQL =
  "DELETE FROM daily_operation_histories WHERE budget_period_id = ?";
const INSERT_SQL =
  "INSERT INTO daily_operation_histories VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
const REPLAY_SQL =
  "WITH RECURSIVE replay AS (SELECT 1) UPDATE daily_operation_histories SET before_total_yen = ?";
const COMPUTED_INSERT_SQL =
  "INSERT INTO daily_operation_histories SELECT total_used_yen FROM daily_totals";

function historyRow(
  overrides: Partial<DailyOperationHistoryRow>,
): DailyOperationHistoryRow {
  return {
    rowid: overrides.rowid ?? 1,
    id: overrides.id ?? "history-a",
    budget_period_id: overrides.budget_period_id ?? PERIOD_ID,
    date: overrides.date ?? DATE,
    operation_type: overrides.operation_type ?? "add",
    input_yen: overrides.input_yen ?? 100,
    before_total_yen: overrides.before_total_yen ?? 0,
    after_total_yen: overrides.after_total_yen ?? 100,
    memo: overrides.memo ?? null,
    created_at: overrides.created_at ?? "2026-04-20T00:00:00.000Z",
  };
}

function dailyTotalRow(overrides: Partial<DailyTotalRow>): DailyTotalRow {
  return {
    budget_period_id: overrides.budget_period_id ?? PERIOD_ID,
    date: overrides.date ?? DATE,
    year_month: overrides.year_month ?? "2026-04",
    total_used_yen: overrides.total_used_yen ?? 0,
    updated_at: overrides.updated_at ?? "2026-04-20T00:00:00.000Z",
  };
}

function mutate(
  sql: string,
  args: unknown[],
  state = createPeriodAwareD1FakeState(),
) {
  applyDailyOperationHistoryMutation(sql, args, state);
  return state;
}

describe("applyDailyOperationHistoryMutation", () => {
  it("leaves state unchanged for irrelevant SQL and below-threshold branch shapes", () => {
    const state = createPeriodAwareD1FakeState();
    state.dailyOperationHistories.push(historyRow({ id: "kept" }));
    state.dailyTotals.set(
      toDailyTotalKey(DATE, PERIOD_ID),
      dailyTotalRow({ total_used_yen: 100 }),
    );
    const before = state.snapshot();
    const noOps: readonly [string, unknown[]][] = [
      ["UPDATE unrelated_table SET input_yen = ?", [999]],
      [REPLAY_SQL, [PERIOD_ID, DATE, "too-short"]],
      [UPDATE_SQL, [1, "memo", PERIOD_ID, DATE]],
      [DELETE_SQL, [PERIOD_ID, DATE]],
      [INSERT_SQL, ["short", PERIOD_ID, DATE, "add", 1, 0, 1, "memo"]],
    ];

    for (const [sql, args] of noOps) {
      mutate(sql, args, state);
    }

    expect(state.snapshot()).toEqual(before);
  });

  it("replays scoped rows and gives recursive SQL precedence over full update", () => {
    const state = createPeriodAwareD1FakeState();
    state.dailyOperationHistories.push(
      historyRow({
        rowid: 2,
        id: "later-add",
        input_yen: 50,
        before_total_yen: -1,
        after_total_yen: -1,
        created_at: "2026-04-20T00:02:00.000Z",
      }),
      historyRow({
        rowid: 1,
        id: "first-add",
        before_total_yen: -1,
        after_total_yen: -1,
        created_at: "2026-04-20T00:01:00.000Z",
      }),
      historyRow({
        rowid: 3,
        id: "overwrite",
        operation_type: "overwrite",
        input_yen: 20,
        before_total_yen: -1,
        after_total_yen: -1,
        created_at: "2026-04-20T00:03:00.000Z",
      }),
      historyRow({
        id: "other-date",
        date: "2026-04-21",
        before_total_yen: 7,
        after_total_yen: 11,
      }),
      historyRow({
        id: "full-update-target",
        budget_period_id: "full-period",
        date: "full-date",
        before_total_yen: 30,
        after_total_yen: 40,
      }),
    );

    mutate(
      REPLAY_SQL,
      [
        PERIOD_ID,
        DATE,
        "unused",
        "unused",
        "full-period",
        "full-date",
        "full-update-target",
      ],
      state,
    );

    expect(state.dailyOperationHistories).toMatchObject([
      { id: "later-add", before_total_yen: 100, after_total_yen: 150 },
      { id: "first-add", before_total_yen: 0, after_total_yen: 100 },
      { id: "overwrite", before_total_yen: 150, after_total_yen: 20 },
      { id: "other-date", before_total_yen: 7, after_total_yen: 11 },
      { id: "full-update-target", before_total_yen: 30, after_total_yen: 40 },
    ]);
  });

  it("preserves full, partial, and delete recognition thresholds", () => {
    const state = createPeriodAwareD1FakeState();
    state.dailyOperationHistories.push(
      historyRow({ id: "full" }),
      historyRow({ id: "partial-five" }),
      historyRow({ id: "partial-six" }),
      historyRow({
        id: "missing-period-id",
        budget_period_id: "partial-decoy-period",
        date: "partial-decoy-date",
        input_yen: 200,
        memo: "decoy",
      }),
      historyRow({ id: "delete-me" }),
      historyRow({ id: "keep-me" }),
    );

    mutate(
      UPDATE_SQL,
      [300, 10, 310, "full memo", PERIOD_ID, DATE, "full"],
      state,
    );
    mutate(
      UPDATE_SQL,
      [
        999,
        "partial memo if fallen through",
        "partial-decoy-period",
        "partial-decoy-date",
        "missing-period-id",
        "missing-date",
        "missing-id",
      ],
      state,
    );
    mutate(UPDATE_SQL, [500, null, PERIOD_ID, DATE, "partial-five"], state);
    mutate(
      UPDATE_SQL,
      [600, "six", PERIOD_ID, DATE, "partial-six", "x"],
      state,
    );
    mutate(UPDATE_SQL, [700, "missing", PERIOD_ID, DATE, "missing"], state);
    mutate(DELETE_SQL, [PERIOD_ID, DATE, "delete-me"], state);
    mutate(DELETE_SQL, [PERIOD_ID, DATE, "missing"], state);

    expect(state.dailyOperationHistories).toMatchObject([
      {
        id: "full",
        input_yen: 300,
        before_total_yen: 10,
        after_total_yen: 310,
        memo: "full memo",
      },
      { id: "partial-five", input_yen: 500, memo: null },
      { id: "partial-six", input_yen: 600, memo: "six" },
      { id: "missing-period-id", input_yen: 200, memo: "decoy" },
      { id: "keep-me" },
    ]);
  });

  it("inserts direct and computed rows, and preserves duplicate rollback surface", () => {
    const state = createPeriodAwareD1FakeState();
    state.dailyTotals.set(
      toDailyTotalKey(DATE, PERIOD_ID),
      dailyTotalRow({ total_used_yen: 1000 }),
    );
    mutate(
      INSERT_SQL,
      [
        "direct",
        PERIOD_ID,
        DATE,
        "overwrite",
        900,
        100,
        900,
        null,
        "2026-04-20T00:09:00.000Z",
      ],
      state,
    );
    const snapshot = state.snapshot();
    expect(() =>
      mutate(
        INSERT_SQL,
        ["direct", PERIOD_ID, DATE, "add", 1, 0, 1, "dup", "2026"],
        state,
      ),
    ).toThrow(
      "D1_ERROR: UNIQUE constraint failed: daily_operation_histories.id",
    );
    state.restore(snapshot);
    mutate(
      COMPUTED_INSERT_SQL,
      [
        "computed-add",
        PERIOD_ID,
        DATE,
        "add",
        250,
        PERIOD_ID,
        DATE,
        PERIOD_ID,
        DATE,
        250,
        "add memo",
        "2026-04-20T00:11:00.000Z",
      ],
      state,
    );
    mutate(
      COMPUTED_INSERT_SQL,
      [
        "computed-overwrite-minimum",
        PERIOD_ID,
        DATE,
        "overwrite",
        700,
        PERIOD_ID,
        DATE,
        700,
        "overwrite memo",
      ],
      state,
    );

    expect(state.dailyOperationHistories).toMatchObject([
      {
        id: "direct",
        operation_type: "overwrite",
        before_total_yen: 100,
        after_total_yen: 900,
        memo: null,
      },
      {
        id: "computed-add",
        before_total_yen: 1000,
        after_total_yen: 1250,
        memo: "add memo",
      },
      {
        id: "computed-overwrite-minimum",
        before_total_yen: 1000,
        after_total_yen: 700,
        memo: "overwrite memo",
        created_at: "undefined",
      },
    ]);
    expect(state.snapshot()).toMatchObject({
      dailyOperationHistories: state.dailyOperationHistories,
    });
  });

  it("updates daily totals after history mutation through SQL dispatch", () => {
    const state = createPeriodAwareD1FakeState();
    state.dailyOperationHistories.push(
      historyRow({
        rowid: 1,
        id: "history-a",
        created_at: "2026-04-20T00:01:00.000Z",
      }),
      historyRow({
        rowid: 2,
        id: "history-b",
        input_yen: 25,
        before_total_yen: 100,
        after_total_yen: 125,
        created_at: "2026-04-20T00:02:00.000Z",
      }),
    );

    applySqlMutation(
      UPDATE_SQL,
      [200, "edited", PERIOD_ID, DATE, "history-a"],
      state,
    );
    applySqlMutation(
      "WITH RECURSIVE replay AS (SELECT id FROM daily_operation_histories) INSERT INTO daily_totals SELECT * FROM replay ON CONFLICT (budget_period_id, date) DO UPDATE SET total_used_yen = excluded.total_used_yen",
      [PERIOD_ID, DATE, PERIOD_ID, DATE, "2026-04", "2026-04-20T00:12:00.000Z"],
      state,
    );

    expect(state.dailyOperationHistories).toMatchObject([
      {
        id: "history-a",
        input_yen: 200,
        before_total_yen: 0,
        after_total_yen: 200,
        memo: "edited",
      },
      { id: "history-b", before_total_yen: 200, after_total_yen: 225 },
    ]);
    expect(state.dailyTotals.get(toDailyTotalKey(DATE, PERIOD_ID))).toEqual(
      dailyTotalRow({
        total_used_yen: 225,
        updated_at: "2026-04-20T00:12:00.000Z",
      }),
    );
  });
});
