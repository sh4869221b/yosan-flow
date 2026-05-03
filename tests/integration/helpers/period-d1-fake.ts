import type { D1Database, D1PreparedStatement } from "$lib/server/db/d1-types";

type BudgetPeriodRow = {
  id: string;
  start_date: string;
  end_date: string;
  budget_yen: number;
  status: "active" | "closed";
  predecessor_period_id: string | null;
  created_at: string;
  updated_at: string;
};

type DailyTotalRow = {
  budget_period_id: string;
  date: string;
  year_month: string;
  total_used_yen: number;
  updated_at: string;
};

function toBudgetPeriodRawRow(sql: string, row: BudgetPeriodRow): unknown[] {
  const normalizedSql = sql.toLowerCase();
  if (normalizedSql.includes('select "end_date" from "budget_periods"')) {
    return [row.end_date];
  }
  if (
    normalizedSql.startsWith('select "id", "start_date"') &&
    !normalizedSql.includes('"end_date"')
  ) {
    return [row.id, row.start_date];
  }
  if (
    normalizedSql.startsWith('select "id"') &&
    !normalizedSql.includes('"start_date"')
  ) {
    return [row.id];
  }

  return [
    row.id,
    row.start_date,
    row.end_date,
    row.budget_yen,
    row.status,
    row.predecessor_period_id,
    row.created_at,
    row.updated_at,
  ];
}

function toDailyTotalRawRow(sql: string, row: DailyTotalRow): unknown[] {
  const normalizedSql = sql.toLowerCase();
  if (normalizedSql.startsWith('select "date"')) {
    return [row.date];
  }

  return [
    row.budget_period_id,
    row.date,
    row.year_month,
    row.total_used_yen,
    row.updated_at,
  ];
}

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

function queryBudgetPeriods(
  sql: string,
  args: unknown[],
  periods: Map<string, BudgetPeriodRow>,
): BudgetPeriodRow[] {
  const normalizedSql = sql.toLowerCase();
  if (!normalizedSql.includes("budget_periods")) {
    return [];
  }

  assertKnownBudgetPeriodQuery(sql);
  const rows = [...periods.values()];
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
    const row = periods.get(String(args[0]));
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

function applyBudgetPeriodMutation(
  sql: string,
  args: unknown[],
  periods: Map<string, BudgetPeriodRow>,
): void {
  const normalizedSql = sql.toLowerCase();
  if (!normalizedSql.includes("budget_periods")) {
    return;
  }
  if (normalizedSql.includes("insert into") && args.length >= 8) {
    periods.set(String(args[0]), {
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
    const existing = periods.get(id);
    if (!existing) {
      return;
    }
    periods.set(id, {
      ...existing,
      start_date: String(args[0]),
      end_date: String(args[1]),
      budget_yen: Number(args[2]),
      updated_at: String(args[3]),
    });
  }
}

function toDailyTotalKey(date: string, budgetPeriodId: string): string {
  return `${budgetPeriodId}:${date}`;
}

function queryDailyTotals(
  sql: string,
  args: unknown[],
  dailyTotals: Map<string, DailyTotalRow>,
): DailyTotalRow[] {
  const normalizedSql = sql.toLowerCase();
  if (!normalizedSql.includes("daily_totals")) {
    return [];
  }

  const rows = [...dailyTotals.values()];
  if (
    normalizedSql.includes('"daily_totals"."budget_period_id" = ?') &&
    normalizedSql.includes('"daily_totals"."date" = ?')
  ) {
    const periodId = String(args[0]);
    const date = String(args[1]);
    const row = dailyTotals.get(toDailyTotalKey(date, periodId));
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

function applyDailyTotalMutation(
  sql: string,
  args: unknown[],
  dailyTotals: Map<string, DailyTotalRow>,
): void {
  const normalizedSql = sql.toLowerCase();
  if (!normalizedSql.includes("daily_totals") || args.length < 5) {
    return;
  }

  const key = toDailyTotalKey(String(args[1]), String(args[0]));
  const existing = dailyTotals.get(key);
  const isAtomicAdd = normalizedSql.includes(
    '"daily_totals"."total_used_yen" + excluded.total_used_yen',
  );
  const row: DailyTotalRow = {
    budget_period_id: String(args[0]),
    date: String(args[1]),
    year_month: String(args[2]),
    total_used_yen:
      isAtomicAdd && existing
        ? existing.total_used_yen + Number(args[3])
        : Number(args[3]),
    updated_at: String(args[4]),
  };
  dailyTotals.set(key, row);
}

export function createPeriodAwareD1Fake(
  preparedSql: string[] = [],
): D1Database {
  const periods = new Map<string, BudgetPeriodRow>();
  const dailyTotals = new Map<string, DailyTotalRow>();

  return {
    prepare(sql: string) {
      preparedSql.push(sql);
      let boundArgs: unknown[] = [];
      const statement: D1PreparedStatement = {
        bind(...args: unknown[]) {
          boundArgs = args;
          return statement;
        },
        async first<T = unknown>() {
          if (
            sql.includes("FROM budget_periods") &&
            sql.includes("WHERE id = ?")
          ) {
            const row = periods.get(String(boundArgs[0]));
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
              : (null as T | null);
          }
          return null;
        },
        async all<T = unknown>() {
          return { results: [] as T[] };
        },
        async raw<T extends unknown[] = unknown[]>() {
          const budgetPeriodRows = queryBudgetPeriods(
            sql,
            boundArgs,
            periods,
          ).map((row) => toBudgetPeriodRawRow(sql, row));
          const dailyTotalRows = queryDailyTotals(
            sql,
            boundArgs,
            dailyTotals,
          ).map((row) => toDailyTotalRawRow(sql, row));
          return [...budgetPeriodRows, ...dailyTotalRows] as T[];
        },
        async run() {
          applyBudgetPeriodMutation(sql, boundArgs, periods);
          applyDailyTotalMutation(sql, boundArgs, dailyTotals);
          return {};
        },
      };
      return statement;
    },
    async batch(statements) {
      for (const statement of statements) {
        await statement.run();
      }
      return [];
    },
  };
}
