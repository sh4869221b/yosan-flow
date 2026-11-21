import {
  applyBudgetPeriodMutation,
  queryBudgetPeriods,
} from "./budget-period-sql";
import { applyDailyOperationHistoryMutation } from "./daily-operation-history-mutations";
import { queryDailyOperationHistories } from "./daily-operation-history-sql";
import { applyDailyTotalMutation, queryDailyTotals } from "./daily-total-sql";
import {
  toBudgetPeriodRawRow,
  toDailyOperationHistoryRawRow,
  toDailyTotalRawRow,
} from "./raw-row-mapping";
import type { PeriodAwareD1FakeState } from "./table-state";

export function selectRawRows(
  sql: string,
  args: unknown[],
  state: PeriodAwareD1FakeState,
): unknown[][] {
  if (sql.includes('from "day_entry_cutover"')) return [["d".repeat(32)]];
  if (sql.startsWith('select "fingerprint" from "day_entry_receipts_v2"')) {
    const fingerprint = state.receipts.get(String(args[0]));
    return fingerprint === undefined ? [] : [[fingerprint]];
  }
  const budgetPeriodRows = queryBudgetPeriods(sql, args, state).map((row) =>
    toBudgetPeriodRawRow(sql, row),
  );
  const dailyTotalRows = queryDailyTotals(sql, args, state).map((row) =>
    toDailyTotalRawRow(sql, row),
  );
  const dailyOperationHistoryRows = queryDailyOperationHistories(
    sql,
    args,
    state,
  ).map((row) => toDailyOperationHistoryRawRow(sql, row));

  return [...budgetPeriodRows, ...dailyTotalRows, ...dailyOperationHistoryRows];
}

export function selectFirstRow<T = unknown>(
  sql: string,
  args: unknown[],
  state: PeriodAwareD1FakeState,
): T | null {
  if (sql.includes("FROM budget_periods") && sql.includes("WHERE id = ?")) {
    const row = state.periods.get(String(args[0]));
    return row
      ? ({
          id: row.id,
          start_date: row.start_date,
          end_date: row.end_date,
          budget_yen: row.budget_yen,
          status: row.status,
          predecessor_period_id: row.predecessor_period_id,
          created_at: row.created_at,
          updated_at: row.updated_at,
        } as T)
      : null;
  }

  return null;
}

export function applySqlMutation(
  sql: string,
  args: unknown[],
  state: PeriodAwareD1FakeState,
  linkedBoundaryChangesOverride?: number,
): number {
  const normalized = sql.toLowerCase().replaceAll('"', "");
  if (normalized.startsWith("delete from day_entry_receipts_v2")) {
    const size = state.receipts.size;
    state.receipts.clear();
    return size;
  }
  if (normalized.startsWith("insert into day_entry_receipts_v2"))
    return insertReceipt(args, state);
  if (/^(update|delete from) daily_operation_histories_v2/.test(normalized)) {
    const [id, date, historyId] = args.slice(-3);
    const matches = state.dailyOperationHistories.some(
      (row) =>
        row.budget_period_id === id &&
        row.date === date &&
        row.id === historyId,
    );
    applyDailyOperationHistoryMutation(sql, args, state);
    return Number(matches);
  }
  if (
    normalized.startsWith("insert into daily_operation_histories_v2") &&
    normalized.includes("from budget_periods")
  ) {
    if (!dailyWriteIsEligible(state, args[1], args[2], normalized, args.at(-1)))
      return 0;
    applyDailyOperationHistoryMutation(sql, args, state);
    return 1;
  }
  if (
    normalized.startsWith("insert into daily_totals") &&
    normalized.includes("from budget_periods")
  ) {
    if (!dailyWriteIsEligible(state, args[0], args[1], normalized, args.at(-1)))
      return 0;
    applyDailyTotalMutation(sql, args, state);
    return 1;
  }
  const changes = applyBudgetPeriodMutation(
    sql,
    args,
    state,
    linkedBoundaryChangesOverride,
  ).length;
  applyDailyTotalMutation(sql, args, state);
  applyDailyOperationHistoryMutation(sql, args, state);
  return changes;
}

function containsDate(
  state: PeriodAwareD1FakeState,
  id: unknown,
  value: unknown,
) {
  const period = state.periods.get(String(id));
  const date = String(value);
  return (
    period !== undefined && period.start_date <= date && date <= period.end_date
  );
}

function dailyWriteIsEligible(
  state: PeriodAwareD1FakeState,
  id: unknown,
  date: unknown,
  sql: string,
  key: unknown,
) {
  return (
    containsDate(state, id, date) &&
    (!sql.includes("from day_entry_receipts_v2") ||
      !state.receipts.has(String(key)))
  );
}

function insertReceipt(args: unknown[], state: PeriodAwareD1FakeState) {
  const [key, fingerprint, id, date] = args.map(String);
  if (!containsDate(state, id, date) || state.receipts.has(key)) return 0;
  state.receipts.set(key, fingerprint);
  return 1;
}
