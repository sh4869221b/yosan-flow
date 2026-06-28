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
): void {
  applyBudgetPeriodMutation(sql, args, state);
  applyDailyTotalMutation(sql, args, state);
  applyDailyOperationHistoryMutation(sql, args, state);
}
