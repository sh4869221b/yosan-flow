import { replayDailyHistoryRows } from "./daily-history-replay";
import { toDailyTotalKey, type PeriodAwareD1FakeState } from "./table-state";
import type { DailyOperationHistoryRow } from "./types";

export function queryDailyOperationHistories(
  sql: string,
  args: unknown[],
  state: PeriodAwareD1FakeState,
): DailyOperationHistoryRow[] {
  const normalizedSql = sql.toLowerCase();
  if (!normalizedSql.includes("daily_operation_histories")) {
    return [];
  }

  const rows = [...state.dailyOperationHistories];
  if (
    normalizedSql.includes(
      '"daily_operation_histories"."budget_period_id" = ?',
    ) &&
    normalizedSql.includes('"daily_operation_histories"."date" = ?')
  ) {
    const periodId = String(args[0]);
    const date = String(args[1]);
    return rows
      .filter((row) => row.budget_period_id === periodId && row.date === date)
      .sort((left, right) => {
        if (left.created_at === right.created_at) {
          return right.rowid - left.rowid;
        }
        return right.created_at.localeCompare(left.created_at);
      });
  }
  if (
    normalizedSql.includes(
      '"daily_operation_histories"."budget_period_id" = ?',
    ) &&
    (normalizedSql.includes('"daily_operation_histories"."date" < ?') ||
      normalizedSql.includes('"daily_operation_histories"."date" > ?'))
  ) {
    const periodId = String(args[0]);
    const startDate = String(args[1]);
    const endDate = String(args[2]);
    return rows.filter(
      (row) =>
        row.budget_period_id === periodId &&
        (row.date < startDate || row.date > endDate),
    );
  }

  return rows;
}

export function applyDailyOperationHistoryMutation(
  sql: string,
  args: unknown[],
  state: PeriodAwareD1FakeState,
): void {
  const normalizedSql = sql.toLowerCase();
  if (!normalizedSql.includes("daily_operation_histories")) {
    return;
  }
  if (
    normalizedSql.includes("with recursive") &&
    normalizedSql.includes("update daily_operation_histories") &&
    args.length >= 4
  ) {
    replayDailyHistoryRows(
      String(args[0]),
      String(args[1]),
      state.dailyOperationHistories,
    );
    return;
  }
  if (normalizedSql.includes("update") && args.length >= 7) {
    const periodId = String(args[4]);
    const date = String(args[5]);
    const id = String(args[6]);
    const existing = state.dailyOperationHistories.find(
      (row) =>
        row.budget_period_id === periodId && row.date === date && row.id === id,
    );
    if (!existing) {
      return;
    }
    existing.input_yen = Number(args[0]);
    existing.before_total_yen = Number(args[1]);
    existing.after_total_yen = Number(args[2]);
    existing.memo = args[3] === null ? null : String(args[3]);
    return;
  }
  if (normalizedSql.includes("update") && args.length >= 5) {
    const periodId = String(args[2]);
    const date = String(args[3]);
    const id = String(args[4]);
    const existing = state.dailyOperationHistories.find(
      (row) =>
        row.budget_period_id === periodId && row.date === date && row.id === id,
    );
    if (!existing) {
      return;
    }
    existing.input_yen = Number(args[0]);
    existing.memo = args[1] === null ? null : String(args[1]);
    return;
  }
  if (normalizedSql.includes("delete from") && args.length >= 3) {
    const periodId = String(args[0]);
    const date = String(args[1]);
    const id = String(args[2]);
    const index = state.dailyOperationHistories.findIndex(
      (row) =>
        row.budget_period_id === periodId && row.date === date && row.id === id,
    );
    if (index >= 0) {
      state.dailyOperationHistories.splice(index, 1);
    }
    return;
  }
  if (!normalizedSql.includes("insert into") || args.length < 9) {
    return;
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
}
