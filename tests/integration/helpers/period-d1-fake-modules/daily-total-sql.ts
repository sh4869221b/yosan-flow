import { toDailyTotalKey, type PeriodAwareD1FakeState } from "./table-state";
import type { DailyTotalRow } from "./types";

export function queryDailyTotals(
  sql: string,
  args: unknown[],
  state: PeriodAwareD1FakeState,
): DailyTotalRow[] {
  const normalizedSql = sql.toLowerCase();
  if (!normalizedSql.includes("daily_totals")) {
    return [];
  }

  const rows = [...state.dailyTotals.values()];
  if (
    normalizedSql.includes('"daily_totals"."budget_period_id" = ?') &&
    normalizedSql.includes('"daily_totals"."date" = ?')
  ) {
    const periodId = String(args[0]);
    const date = String(args[1]);
    const row = state.dailyTotals.get(toDailyTotalKey(date, periodId));
    return row ? [row] : [];
  }
  if (
    normalizedSql.includes('"daily_totals"."budget_period_id" = ?') &&
    (normalizedSql.includes('"daily_totals"."date" < ?') ||
      normalizedSql.includes('"daily_totals"."date" > ?'))
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
  if (normalizedSql.includes('"daily_totals"."budget_period_id" = ?')) {
    const periodId = String(args[0]);
    return rows
      .filter((row) => row.budget_period_id === periodId)
      .sort((left, right) => left.date.localeCompare(right.date));
  }

  return rows;
}

export function applyDailyTotalMutation(
  sql: string,
  args: unknown[],
  state: PeriodAwareD1FakeState,
): void {
  const normalizedSql = sql.toLowerCase().replaceAll('"', "");
  if (!/^\s*(?:insert into|delete from) daily_totals\b/.test(normalizedSql)) {
    return;
  }

  if (normalizedSql.includes("delete from daily_totals")) {
    const periodId = String(args[0]);
    const date = String(args[1]);
    const hasHistories = state.dailyOperationHistories.some(
      (row) => row.budget_period_id === periodId && row.date === date,
    );
    if (!hasHistories) {
      state.dailyTotals.delete(toDailyTotalKey(date, periodId));
    }
    return;
  }

  if (args.length < 5) {
    return;
  }

  const isReplayTotal =
    normalizedSql.includes("from daily_operation_histories") &&
    /order by (?:daily_operation_histories\.)?created_at desc, rowid desc/.test(
      normalizedSql,
    );
  const periodId = String(args[0]);
  const date = String(args[1]);
  const key = toDailyTotalKey(date, periodId);
  const existing = state.dailyTotals.get(key);
  const isAtomicAdd =
    normalizedSql.includes(
      '"daily_totals"."total_used_yen" + excluded.total_used_yen',
    ) ||
    normalizedSql.includes(
      "daily_totals.total_used_yen + excluded.total_used_yen",
    );
  const lastHistory = isReplayTotal
    ? state.dailyOperationHistories
        .filter(
          (row) =>
            row.budget_period_id === String(args[4]) &&
            row.date === String(args[5]),
        )
        .sort((left, right) =>
          left.created_at === right.created_at
            ? right.rowid - left.rowid
            : right.created_at.localeCompare(left.created_at),
        )[0]
    : undefined;
  if (isReplayTotal && !lastHistory) {
    return;
  }

  const row: DailyTotalRow = {
    budget_period_id: periodId,
    date,
    year_month: String(args[2]),
    total_used_yen: isReplayTotal
      ? lastHistory!.after_total_yen
      : isAtomicAdd && existing
        ? existing.total_used_yen + Number(args[3])
        : Number(args[3]),
    updated_at: String(isReplayTotal ? args[3] : args[4]),
  };
  state.dailyTotals.set(key, row);
}
