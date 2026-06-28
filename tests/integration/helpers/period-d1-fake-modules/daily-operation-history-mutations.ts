import { replayDailyHistoryRows } from "./daily-history-replay";
import { toDailyTotalKey, type PeriodAwareD1FakeState } from "./table-state";
import type { DailyOperationHistoryRow } from "./types";

type HistoryIdentity = {
  readonly periodId: string;
  readonly date: string;
  readonly id: string;
};

export function applyDailyOperationHistoryMutation(
  sql: string,
  args: unknown[],
  state: PeriodAwareD1FakeState,
): void {
  const normalizedSql = sql.toLowerCase();
  if (!normalizedSql.includes("daily_operation_histories")) {
    return;
  }
  if (tryApplyRecursiveReplay(normalizedSql, args, state)) {
    return;
  }
  if (tryApplyFullUpdate(normalizedSql, args, state)) {
    return;
  }
  if (tryApplyPartialUpdate(normalizedSql, args, state)) {
    return;
  }
  if (tryApplyDelete(normalizedSql, args, state)) {
    return;
  }
  tryApplyInsert(normalizedSql, args, state);
}

function tryApplyRecursiveReplay(
  normalizedSql: string,
  args: unknown[],
  state: PeriodAwareD1FakeState,
): boolean {
  if (
    !normalizedSql.includes("with recursive") ||
    !normalizedSql.includes("update daily_operation_histories") ||
    args.length < 4
  ) {
    return false;
  }

  replayDailyHistoryRows(
    String(args[0]),
    String(args[1]),
    state.dailyOperationHistories,
  );
  return true;
}

function tryApplyFullUpdate(
  normalizedSql: string,
  args: unknown[],
  state: PeriodAwareD1FakeState,
): boolean {
  if (!normalizedSql.includes("update") || args.length < 7) {
    return false;
  }

  const existing = findDailyOperationHistory(state.dailyOperationHistories, {
    periodId: String(args[4]),
    date: String(args[5]),
    id: String(args[6]),
  });
  if (!existing) {
    return true;
  }

  existing.input_yen = Number(args[0]);
  existing.before_total_yen = Number(args[1]);
  existing.after_total_yen = Number(args[2]);
  existing.memo = args[3] === null ? null : String(args[3]);
  return true;
}

function tryApplyPartialUpdate(
  normalizedSql: string,
  args: unknown[],
  state: PeriodAwareD1FakeState,
): boolean {
  if (!normalizedSql.includes("update") || args.length < 5) {
    return false;
  }

  const existing = findDailyOperationHistory(state.dailyOperationHistories, {
    periodId: String(args[2]),
    date: String(args[3]),
    id: String(args[4]),
  });
  if (!existing) {
    return true;
  }

  existing.input_yen = Number(args[0]);
  existing.memo = args[1] === null ? null : String(args[1]);
  return true;
}

function tryApplyDelete(
  normalizedSql: string,
  args: unknown[],
  state: PeriodAwareD1FakeState,
): boolean {
  if (!normalizedSql.includes("delete from") || args.length < 3) {
    return false;
  }

  const identity = {
    periodId: String(args[0]),
    date: String(args[1]),
    id: String(args[2]),
  };
  const index = state.dailyOperationHistories.findIndex((row) =>
    matchesHistory(row, identity),
  );
  if (index >= 0) {
    state.dailyOperationHistories.splice(index, 1);
  }
  return true;
}

function tryApplyInsert(
  normalizedSql: string,
  args: unknown[],
  state: PeriodAwareD1FakeState,
): boolean {
  if (!normalizedSql.includes("insert into") || args.length < 9) {
    return false;
  }

  const id = String(args[0]);
  const duplicated = state.dailyOperationHistories.some((row) => row.id === id);
  if (duplicated) {
    throw new Error(
      "D1_ERROR: UNIQUE constraint failed: daily_operation_histories.id",
    );
  }

  const budgetPeriodId = String(args[1]);
  const date = String(args[2]);
  const operationType = args[3] === "overwrite" ? "overwrite" : "add";
  const inputYen = Number(args[4]);
  const total = state.dailyTotals.get(toDailyTotalKey(date, budgetPeriodId));
  const computesTotalsFromDailyTotals =
    normalizedSql.includes("select total_used_yen") &&
    normalizedSql.includes("from daily_totals");
  const beforeTotalYen = computesTotalsFromDailyTotals
    ? (total?.total_used_yen ?? 0)
    : Number(args[5]);
  const afterTotalYen = computesTotalsFromDailyTotals
    ? operationType === "add"
      ? beforeTotalYen + inputYen
      : inputYen
    : Number(args[6]);
  const memoIndex = computesTotalsFromDailyTotals
    ? operationType === "add"
      ? 10
      : 8
    : 7;
  const createdAtIndex = memoIndex + 1;

  state.dailyOperationHistories.push({
    rowid: state.nextHistoryRowId(),
    id,
    budget_period_id: budgetPeriodId,
    date,
    operation_type: operationType,
    input_yen: inputYen,
    before_total_yen: beforeTotalYen,
    after_total_yen: afterTotalYen,
    memo: args[memoIndex] === null ? null : String(args[memoIndex]),
    created_at: String(args[createdAtIndex]),
  });
  return true;
}

function findDailyOperationHistory(
  rows: readonly DailyOperationHistoryRow[],
  identity: HistoryIdentity,
): DailyOperationHistoryRow | undefined {
  return rows.find((row) => matchesHistory(row, identity));
}

function matchesHistory(
  row: DailyOperationHistoryRow,
  identity: HistoryIdentity,
): boolean {
  return (
    row.budget_period_id === identity.periodId &&
    row.date === identity.date &&
    row.id === identity.id
  );
}
