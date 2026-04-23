import { describe, expect, it } from "vitest";
import type { D1Database } from "$lib/server/db/d1-types";
import { GET as periodsGetDefaultRoute, POST as periodsPostDefaultRoute } from "../../../src/routes/api/periods/+server";
import { GET as periodGetDefaultRoute } from "../../../src/routes/api/periods/[periodId]/+server";
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
              async run() {
                return {};
              }
            };
          },
          async first() {
            return null;
          },
          async all() {
            return { results: [] };
          },
          async run() {
            return {};
          }
        };
      },
      async batch() {
        return [];
      }
    } as unknown as D1Database;

    const response = await periodsGetDefaultRoute({
      request: new Request("http://localhost/api/periods", { method: "GET" }),
      platform: { env: { DB: fakeDb } }
    } as any);

    expect(response.status).toBe(200);
    expect(preparedSql.some((sql) => sql.includes("CREATE TABLE IF NOT EXISTS budget_periods"))).toBe(true);
  });

  it("creates period then can read summary and add day in D1 path", async () => {
    const preparedSql: string[] = [];
    const fakeDb = {
      prepare(sql: string) {
        preparedSql.push(sql);
        return {
          bind(...args: unknown[]) {
            return {
              async first() {
                if (sql.includes("FROM budget_periods") && sql.includes("WHERE id = ?")) {
                  return {
                    id: "p1",
                    start_date: "2026-04-20",
                    end_date: "2026-05-19",
                    budget_yen: 100000,
                    status: "active",
                    predecessor_period_id: null,
                    created_at: "2026-04-01T00:00:00.000Z",
                    updated_at: "2026-04-01T00:00:00.000Z"
                  };
                }
                if (sql.includes("SELECT total_used_yen") && args[1] === "2026-04-20") {
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
                        total_used_yen: 2000
                      }
                    ]
                  };
                }
                return { results: [] };
              },
              async run() {
                return {};
              }
            };
          },
          async first() {
            return null;
          },
          async all() {
            return { results: [] };
          },
          async run() {
            return {};
          }
        };
      },
      async batch() {
        return [];
      }
    } as unknown as D1Database;

    const createResponse = await periodsPostDefaultRoute({
      request: new Request("http://localhost/api/periods", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: "p1",
          startDate: "2026-04-20",
          endDate: "2026-05-19",
          budgetYen: 100000
        })
      }),
      platform: { env: { DB: fakeDb } }
    } as any);
    expect(createResponse.status).toBe(201);

    const periodResponse = await periodGetDefaultRoute({
      params: { periodId: "p1" },
      request: new Request("http://localhost/api/periods/p1", { method: "GET" }),
      platform: { env: { DB: fakeDb } }
    } as any);
    expect(periodResponse.status).toBe(200);

    const addResponse = await dayAddDefaultRoute({
      params: { periodId: "p1", date: "2026-04-20" },
      request: new Request("http://localhost/api/periods/p1/days/2026-04-20/add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ inputYen: 1000 })
      }),
      platform: { env: { DB: fakeDb } }
    } as any);
    expect(addResponse.status).toBe(200);
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
