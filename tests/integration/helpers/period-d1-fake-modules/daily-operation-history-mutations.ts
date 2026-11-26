import { replayDailyHistoryRows } from "./daily-history-replay";
import { requirePeriodYenFits } from "#lib/server/domain/yen.ts";
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
  const normalizedSql = sql.toLowerCase().replaceAll('"', "").trim();
  if (!normalizedSql.includes("daily_operation_histories_v2")) {
    return;
  }
  if (tryApplyRecursiveReplay(normalizedSql, args, state)) {
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
    !normalizedSql.startsWith("with recursive") ||
    !normalizedSql.includes("from replay_writes")
  ) {
    return false;
  }

  const [periodId, date, id] = args.slice(0, 3).map(String);
  const target = findDailyOperationHistory(state.dailyOperationHistories, {
    periodId,
    date,
    id,
  });
  const amount = args[3] === null ? null : Number(args[3]);
  if (!target) return true;
  const afterTotalYen =
    amount === target.input_yen
      ? (state.dailyTotals.get(toDailyTotalKey(date, periodId))
          ?.total_used_yen ?? 0)
      : replayDailyHistoryRows(
          periodId,
          date,
          state.dailyOperationHistories,
          id,
          amount,
          args[6] === 1,
        );
  requireFakePeriodYenFits(state, periodId, date, afterTotalYen);

  return true;
}

function tryApplyPartialUpdate(
  normalizedSql: string,
  args: unknown[],
  state: PeriodAwareD1FakeState,
): boolean {
  if (
    !normalizedSql.startsWith("update daily_operation_histories_v2") ||
    args.length < 5
  ) {
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
  if (
    !normalizedSql.startsWith("delete from daily_operation_histories_v2") ||
    args.length < 3
  ) {
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
  if (
    !normalizedSql.startsWith("insert into daily_operation_histories_v2") ||
    args.length < 9
  ) {
    return false;
  }

  const id = String(args[0]);
  const duplicated = state.dailyOperationHistories.some((row) => row.id === id);
  if (duplicated) {
    throw new Error(
      "D1_ERROR: UNIQUE constraint failed: daily_operation_histories_v2.id",
    );
  }

  const budgetPeriodId = String(args[1]);
  const date = String(args[2]);
  const operationType = args[3] === "overwrite" ? "overwrite" : "add";
  const inputYen = Number(args[4]);
  const total = state.dailyTotals.get(toDailyTotalKey(date, budgetPeriodId));
  const computesTotalsFromDailyTotals = normalizedSql.includes(
    "left join daily_totals",
  );
  const beforeTotalYen = computesTotalsFromDailyTotals
    ? (total?.total_used_yen ?? 0)
    : Number(args[5]);
  const afterTotalYen = computesTotalsFromDailyTotals
    ? operationType === "add"
      ? beforeTotalYen + inputYen
      : inputYen
    : Number(args[6]);
  if (computesTotalsFromDailyTotals)
    requireFakePeriodYenFits(state, budgetPeriodId, date, afterTotalYen);
  const memoIndex = computesTotalsFromDailyTotals ? 18 : 7;
  const createdAtIndex = memoIndex + 1;

  const rowid = state.nextHistoryRowId();
  const writeOrder =
    Math.max(
      0,
      ...state.dailyOperationHistories
        .filter(
          (row) => row.budget_period_id === budgetPeriodId && row.date === date,
        )
        .map((row) => row.write_order),
    ) + 1;
  state.dailyOperationHistories.push({
    write_order: computesTotalsFromDailyTotals ? writeOrder : 0,
    rowid,
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

function requireFakePeriodYenFits(
  state: PeriodAwareD1FakeState,
  periodId: string,
  date: string,
  afterTotalYen: number,
) {
  requirePeriodYenFits(
    state.dailyTotals.values().map((row) => ({
      budgetPeriodId: row.budget_period_id,
      date: row.date,
      totalUsedYen: row.total_used_yen,
    })),
    periodId,
    date,
    afterTotalYen,
  );
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
