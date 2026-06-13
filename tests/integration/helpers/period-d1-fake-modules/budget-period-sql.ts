import type { PeriodAwareD1FakeState } from "./table-state";
import type { BudgetPeriodRow } from "./types";

function assertKnownBudgetPeriodQuery(sql: string): void {
  const normalizedSql = sql.toLowerCase();
  const known =
    normalizedSql.includes('where "budget_periods"."predecessor_period_id"') ||
    normalizedSql.includes('"budget_periods"."id" <> ?') ||
    normalizedSql.includes('"budget_periods"."id" = ?') ||
    (normalizedSql.includes('"budget_periods"."start_date" <= ?') &&
      normalizedSql.includes('"budget_periods"."end_date" >= ?')) ||
    !normalizedSql.includes("where");

  if (!known) {
    throw new Error(`Unhandled budget period query in D1 fake: ${sql}`);
  }
}

export function queryBudgetPeriods(
  sql: string,
  args: unknown[],
  state: PeriodAwareD1FakeState,
): BudgetPeriodRow[] {
  const normalizedSql = sql.toLowerCase();
  if (!normalizedSql.includes("budget_periods")) {
    return [];
  }

  assertKnownBudgetPeriodQuery(sql);
  const rows = [...state.periods.values()];
  if (
    normalizedSql.includes('where "budget_periods"."predecessor_period_id"')
  ) {
    return rows.filter((row) => row.predecessor_period_id === String(args[0]));
  }
  if (normalizedSql.includes('"budget_periods"."id" <> ?')) {
    return rows.filter(
      (row) =>
        row.id !== String(args[0]) &&
        row.start_date <= String(args[1]) &&
        row.end_date >= String(args[2]),
    );
  }
  if (normalizedSql.includes('"budget_periods"."id" = ?')) {
    const row = state.periods.get(String(args[0]));
    return row ? [row] : [];
  }
  if (
    normalizedSql.includes('"budget_periods"."start_date" <= ?') &&
    normalizedSql.includes('"budget_periods"."end_date" >= ?')
  ) {
    const endDate = String(args[0]);
    const startDate = String(args[1]);
    return rows.filter(
      (row) => row.start_date <= endDate && row.end_date >= startDate,
    );
  }

  return rows.sort((left, right) =>
    left.start_date.localeCompare(right.start_date),
  );
}

export function applyBudgetPeriodMutation(
  sql: string,
  args: unknown[],
  state: PeriodAwareD1FakeState,
): void {
  const normalizedSql = sql.toLowerCase();
  if (!normalizedSql.includes("budget_periods")) {
    return;
  }
  if (normalizedSql.includes("insert into") && args.length >= 8) {
    state.periods.set(String(args[0]), {
      id: String(args[0]),
      start_date: String(args[1]),
      end_date: String(args[2]),
      budget_yen: Number(args[3]),
      status: args[4] === "closed" ? "closed" : "active",
      predecessor_period_id: args[5] === null ? null : String(args[5]),
      created_at: String(args[6]),
      updated_at: String(args[7]),
    });
    return;
  }

  if (normalizedSql.includes("update") && args.length >= 5) {
    const id = String(args[4]);
    const existing = state.periods.get(id);
    if (!existing) {
      return;
    }
    state.periods.set(id, {
      ...existing,
      start_date: String(args[0]),
      end_date: String(args[1]),
      budget_yen: Number(args[2]),
      updated_at: String(args[3]),
    });
  }
}
