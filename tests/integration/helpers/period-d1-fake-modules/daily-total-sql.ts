import { filterEntriesOutsideRange } from "./entries-outside-range";
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
    return filterEntriesOutsideRange(rows, args);
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

  if (normalizedSql.startsWith("delete from daily_totals")) {
    deleteReplayedDailyTotal(args, state);
    return;
  }
  if (args.length < 5) return;

  if (
    /order by coalesce\(nullif\((?:daily_operation_histories\.)?write_order, 0\), rowid\) desc, rowid desc/.test(
      normalizedSql,
    )
  ) {
    upsertReplayedDailyTotal(args, state, normalizedSql.includes("is null"));
    return;
  }

  const [periodId, date, yearMonth, input, now] = args;
  const key = toDailyTotalKey(String(date), String(periodId));
  const previous = state.dailyTotals.get(key);
  const isAdd = normalizedSql.includes(
    "daily_totals.total_used_yen + excluded.total_used_yen",
  );
  state.dailyTotals.set(key, {
    budget_period_id: String(periodId),
    date: String(date),
    year_month: String(yearMonth),
    total_used_yen:
      Number(input) + (isAdd ? (previous?.total_used_yen ?? 0) : 0),
    updated_at: String(now),
  });
}

function scopedHistories(
  state: PeriodAwareD1FakeState,
  periodId: unknown,
  date: unknown,
) {
  return state.dailyOperationHistories.filter(
    (row) => row.budget_period_id === periodId && row.date === date,
  );
}

function deleteReplayedDailyTotal(
  args: unknown[],
  state: PeriodAwareD1FakeState,
) {
  const [periodId, date, , , target] = args;
  const histories = scopedHistories(state, periodId, date);
  const excludedId = args[7];
  if (
    histories.some((row) => row.id === target) &&
    histories.every((row) => row.id === excludedId)
  ) {
    state.dailyTotals.delete(toDailyTotalKey(String(date), String(periodId)));
  }
}

function upsertReplayedDailyTotal(
  args: unknown[],
  state: PeriodAwareD1FakeState,
  deleting: boolean,
) {
  const [periodId, date, yearMonth, now] = args;
  const histories = scopedHistories(state, periodId, date);
  const targetId = deleting ? args[9] : args[8];
  const target = histories.find((row) => row.id === targetId);
  if (!target || (!deleting && target.input_yen === args[9])) return;
  const last = histories
    .filter((row) => !deleting || row.id !== targetId)
    .sort(
      (left, right) =>
        (right.write_order || right.rowid) - (left.write_order || left.rowid) ||
        right.rowid - left.rowid,
    )[0];
  if (!last) return;
  state.dailyTotals.set(toDailyTotalKey(String(date), String(periodId)), {
    budget_period_id: String(periodId),
    date: String(date),
    year_month: String(yearMonth),
    total_used_yen: last.after_total_yen,
    updated_at: String(now),
  });
}
