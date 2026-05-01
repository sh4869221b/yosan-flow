import { describe, expect, it } from "vitest";
import type { D1Database } from "$lib/server/db/d1-types";
import {
  GET as periodsGetDefaultRoute,
  POST as periodsPostDefaultRoute,
} from "../../../src/routes/api/periods/+server";
import {
  GET as periodGetDefaultRoute,
  PUT as periodPutDefaultRoute,
} from "../../../src/routes/api/periods/[periodId]/+server";
import { POST as dayAddDefaultRoute } from "../../../src/routes/api/periods/[periodId]/days/[date]/add/+server";
import { GET as legacyMonthGet } from "../../../src/routes/api/months/[yearMonth]/+server";
import { POST as legacyMonthInitialize } from "../../../src/routes/api/months/[yearMonth]/initialize/+server";
import { PUT as legacyMonthBudget } from "../../../src/routes/api/months/[yearMonth]/budget/+server";
import { POST as legacyDayAdd } from "../../../src/routes/api/days/[date]/add/+server";
import { PUT as legacyDayOverwrite } from "../../../src/routes/api/days/[date]/overwrite/+server";
import { GET as legacyDayHistory } from "../../../src/routes/api/days/[date]/history/+server";

describe("period API default routes", () => {
  it("uses platform.env.DB backed adapter path", async () => {
    const preparedSql: string[] = [];
    const fakeDb = {
      prepare(sql: string) {
        preparedSql.push(sql);
        return {
          bind() {
            return {
              async first() {
                return null;
              },
              async all() {
                return { results: [] };
              },
              async raw() {
                return [];
              },
              async run() {
                return {};
              },
            };
          },
          async first() {
            return null;
          },
          async all() {
            return { results: [] };
          },
          async raw() {
            return [];
          },
          async run() {
            return {};
          },
        };
      },
      async batch() {
        return [];
      },
    } as unknown as D1Database;

    const response = await periodsGetDefaultRoute({
      request: new Request("http://localhost/api/periods", { method: "GET" }),
      platform: { env: { DB: fakeDb } },
    } as any);

    expect(response.status).toBe(200);
    expect(
      preparedSql.some((sql) =>
        sql.includes("CREATE TABLE IF NOT EXISTS budget_periods"),
      ),
    ).toBe(true);
  });

  it("creates period then can read summary and add day in D1 path", async () => {
    const preparedSql: string[] = [];
    const fakeDb = createPeriodAwareD1Fake(preparedSql);

    const createResponse = await periodsPostDefaultRoute({
      request: new Request("http://localhost/api/periods", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: "p1",
          startDate: "2026-04-20",
          endDate: "2026-05-19",
          budgetYen: 100000,
        }),
      }),
      platform: { env: { DB: fakeDb } },
    } as any);
    expect(createResponse.status).toBe(201);

    const periodResponse = await periodGetDefaultRoute({
      params: { periodId: "p1" },
      request: new Request("http://localhost/api/periods/p1", {
        method: "GET",
      }),
      platform: { env: { DB: fakeDb } },
    } as any);
    expect(periodResponse.status).toBe(200);

    const addResponse = await dayAddDefaultRoute({
      params: { periodId: "p1", date: "2026-04-20" },
      request: new Request(
        "http://localhost/api/periods/p1/days/2026-04-20/add",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ inputYen: 1000 }),
        },
      ),
      platform: { env: { DB: fakeDb } },
    } as any);
    expect(addResponse.status).toBe(200);
  });

  it("updates periods and preserves validation errors in D1 path", async () => {
    const fakeDb = createPeriodAwareD1Fake();
    await createPeriod(fakeDb, {
      id: "p-a",
      startDate: "2026-04-20",
      endDate: "2026-05-19",
      budgetYen: 100000,
    });
    await createPeriod(fakeDb, {
      id: "p-b",
      startDate: "2026-05-20",
      endDate: "2026-06-19",
      budgetYen: 100000,
      predecessorPeriodId: "p-a",
    });

    const overlapResponse = await periodsPostDefaultRoute({
      request: new Request("http://localhost/api/periods", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: "p-overlap",
          startDate: "2026-05-01",
          endDate: "2026-05-25",
          budgetYen: 100000,
        }),
      }),
      platform: { env: { DB: fakeDb } },
    } as any);
    expect(overlapResponse.status).toBe(400);
    await expect(overlapResponse.json()).resolves.toMatchObject({
      error: { code: "PERIOD_OVERLAP" },
    });

    const continuityResponse = await periodPutDefaultRoute({
      params: { periodId: "p-a" },
      request: new Request("http://localhost/api/periods/p-a", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          startDate: "2026-04-20",
          endDate: "2026-05-18",
          budgetYen: 100000,
        }),
      }),
      platform: { env: { DB: fakeDb } },
    } as any);
    expect(continuityResponse.status).toBe(400);
    await expect(continuityResponse.json()).resolves.toMatchObject({
      error: { code: "PERIOD_CONTINUITY_VIOLATION" },
    });

    const updateResponse = await periodPutDefaultRoute({
      params: { periodId: "p-a" },
      request: new Request("http://localhost/api/periods/p-a", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          startDate: "2026-04-20",
          endDate: "2026-05-19",
          budgetYen: 120000,
        }),
      }),
      platform: { env: { DB: fakeDb } },
    } as any);
    expect(updateResponse.status).toBe(200);
    await expect(updateResponse.json()).resolves.toMatchObject({
      periodId: "p-a",
      budgetYen: 120000,
    });
  });

  it("legacy month/day endpoints return 410", async () => {
    const monthRes = await legacyMonthGet({} as any);
    const monthInitRes = await legacyMonthInitialize({} as any);
    const monthBudgetRes = await legacyMonthBudget({} as any);
    const addRes = await legacyDayAdd({} as any);
    const overwriteRes = await legacyDayOverwrite({} as any);
    const historyRes = await legacyDayHistory({} as any);

    expect(monthRes.status).toBe(410);
    expect(monthInitRes.status).toBe(410);
    expect(monthBudgetRes.status).toBe(410);
    expect(addRes.status).toBe(410);
    expect(overwriteRes.status).toBe(410);
    expect(historyRes.status).toBe(410);
  });
});

type CreatePeriodBody = {
  id: string;
  startDate: string;
  endDate: string;
  budgetYen: number;
  predecessorPeriodId?: string | null;
};

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

function toRawRow(sql: string, row: BudgetPeriodRow): unknown[] {
  const normalizedSql = sql.toLowerCase();
  if (
    normalizedSql.startsWith('select "end_date"') ||
    normalizedSql.includes('select "end_date" from "budget_periods"')
  ) {
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

async function createPeriod(
  db: D1Database,
  body: CreatePeriodBody,
): Promise<void> {
  const response = await periodsPostDefaultRoute({
    request: new Request("http://localhost/api/periods", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    platform: { env: { DB: db } },
  } as any);
  expect(response.status).toBe(201);
}

function createPeriodAwareD1Fake(preparedSql: string[] = []): D1Database {
  const periods = new Map<string, BudgetPeriodRow>();

  return {
    prepare(sql: string) {
      preparedSql.push(sql);
      let boundArgs: unknown[] = [];
      const statement = {
        bind(...args: unknown[]) {
          boundArgs = args;
          return statement;
        },
        async first() {
          if (
            sql.includes("FROM budget_periods") &&
            sql.includes("WHERE id = ?")
          ) {
            const row = periods.get(String(boundArgs[0]));
            return row
              ? {
                  id: row.id,
                  start_date: row.start_date,
                  end_date: row.end_date,
                  budget_yen: row.budget_yen,
                  status: row.status,
                  predecessor_period_id: row.predecessor_period_id,
                  created_at: row.created_at,
                  updated_at: row.updated_at,
                }
              : null;
          }
          if (
            sql.includes("FROM daily_totals") &&
            sql.includes("total_used_yen") &&
            boundArgs[1] === "2026-04-20"
          ) {
            return { total_used_yen: 1000 };
          }
          return null;
        },
        async all() {
          if (sql.includes("FROM daily_totals")) {
            return {
              results: [
                {
                  budget_period_id: "p1",
                  date: "2026-04-20",
                  total_used_yen: 2000,
                },
              ],
            };
          }
          return { results: [] };
        },
        async raw<T extends unknown[] = unknown[]>() {
          return queryBudgetPeriods(sql, boundArgs, periods).map((row) =>
            toRawRow(sql, row),
          ) as T[];
        },
        async run() {
          applyBudgetPeriodMutation(sql, boundArgs, periods);
          return {};
        },
      };
      return {
        ...statement,
      };
    },
    async batch() {
      return [];
    },
  } as D1Database;
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
  if (
    normalizedSql.includes('"budget_periods"."id" = ?') &&
    normalizedSql.includes("where")
  ) {
    const row = periods.get(String(args[0]));
    return row ? [row] : [];
  }
  if (
    normalizedSql.includes("start_date") &&
    normalizedSql.includes("end_date") &&
    normalizedSql.includes("where")
  ) {
    const dateOrEndDate = String(args[0]);
    const startDate = String(args[1]);
    return rows.filter(
      (row) => row.start_date <= dateOrEndDate && row.end_date >= startDate,
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
