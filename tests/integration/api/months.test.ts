import { describe, expect, it } from "vitest";
import type { D1Database } from "$lib/server/db/d1-types";
import {
  createInMemoryApiServices,
  type InMemoryApiServices
} from "$lib/server/services/month-summary-service";
import { GET as monthGetDefaultRoute, _createMonthGetHandler } from "../../../src/routes/api/months/[yearMonth]/+server";
import { POST as dayAddDefaultRoute } from "../../../src/routes/api/days/[date]/add/+server";
import { PUT as monthPutBudgetDefaultRoute, _createMonthBudgetHandler } from "../../../src/routes/api/months/[yearMonth]/budget/+server";
import { _createMonthInitializeHandler } from "../../../src/routes/api/months/[yearMonth]/initialize/+server";
import { _createDayAddHandler } from "../../../src/routes/api/days/[date]/add/+server";
import { _createDayOverwriteHandler } from "../../../src/routes/api/days/[date]/overwrite/+server";
import { _createDayHistoryHandler } from "../../../src/routes/api/days/[date]/history/+server";

async function parseJson(response: Response): Promise<any> {
  return response.json();
}

function createFixture(now = new Date("2026-04-18T00:00:00.000Z")): {
  services: InMemoryApiServices;
  getMonth: ReturnType<typeof _createMonthGetHandler>;
  initializeMonth: ReturnType<typeof _createMonthInitializeHandler>;
  putBudget: ReturnType<typeof _createMonthBudgetHandler>;
  addDay: ReturnType<typeof _createDayAddHandler>;
  overwriteDay: ReturnType<typeof _createDayOverwriteHandler>;
  getHistory: ReturnType<typeof _createDayHistoryHandler>;
} {
  const services = createInMemoryApiServices({
    now: () => now
  });

  return {
    services,
    getMonth: _createMonthGetHandler({ services }),
    initializeMonth: _createMonthInitializeHandler({ services }),
    putBudget: _createMonthBudgetHandler({ services }),
    addDay: _createDayAddHandler({ services }),
    overwriteDay: _createDayOverwriteHandler({ services }),
    getHistory: _createDayHistoryHandler({ services })
  };
}

describe("month and day APIs", () => {
  it("default GET route uses platform.env.DB backed adapter path", async () => {
    const preparedSql: string[] = [];
    const bindArgsList: unknown[][] = [];
    const fakeDb = {
      prepare(sql: string) {
        preparedSql.push(sql);
        return {
          bind(...args: unknown[]) {
            bindArgsList.push(args);
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

    const response = await monthGetDefaultRoute({
      params: { yearMonth: "2026-04" },
      request: new Request("http://localhost/api/months/2026-04", {
        method: "GET"
      }),
      platform: {
        env: { DB: fakeDb }
      }
    } as any);

    expect(response.status).toBe(200);
    expect(preparedSql.some((sql) => sql.includes("CREATE TABLE IF NOT EXISTS monthly_budgets"))).toBe(true);
    expect(preparedSql.some((sql) => sql.includes("FROM monthly_budgets"))).toBe(true);
    expect(preparedSql.some((sql) => sql.includes("FROM daily_totals"))).toBe(true);
    expect(bindArgsList.some((args) => args[0] === "2026-03")).toBe(true);
  });

  it("default day add route reads daily total and writes via D1 batch", async () => {
    const preparedSql: string[] = [];
    let batchCallCount = 0;
    const fakeDb = {
      prepare(sql: string) {
        preparedSql.push(sql);
        return {
          bind() {
            return {
              async first() {
                if (sql.includes("FROM monthly_budgets")) {
                  return {
                    year_month: "2026-04",
                    budget_yen: 100000,
                    budget_status: "set",
                    initialized_from_previous_month: 0,
                    carried_from_year_month: null,
                    created_at: "2026-04-01T00:00:00.000Z",
                    updated_at: "2026-04-01T00:00:00.000Z"
                  };
                }
                if (sql.includes("SELECT total_used_yen FROM daily_totals")) {
                  return {
                    total_used_yen: 1000
                  };
                }
                return null;
              },
              async all() {
                if (sql.includes("FROM daily_totals") && sql.includes("ORDER BY date ASC")) {
                  return {
                    results: [
                      {
                        date: "2026-04-18",
                        year_month: "2026-04",
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
        batchCallCount += 1;
        return [];
      }
    } as unknown as D1Database;

    const response = await dayAddDefaultRoute({
      params: { date: "2026-04-18" },
      request: new Request("http://localhost/api/days/2026-04-18/add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ inputYen: 1000 })
      }),
      platform: {
        env: { DB: fakeDb }
      }
    } as any);

    expect(response.status).toBe(200);
    const ensureSchemaIndex = preparedSql.findIndex((sql) =>
      sql.includes("CREATE TABLE IF NOT EXISTS monthly_budgets")
    );
    const readDailyTotalIndex = preparedSql.findIndex((sql) =>
      sql.includes("SELECT total_used_yen FROM daily_totals")
    );
    expect(ensureSchemaIndex).toBeGreaterThanOrEqual(0);
    expect(readDailyTotalIndex).toBeGreaterThanOrEqual(0);
    expect(ensureSchemaIndex).toBeLessThan(readDailyTotalIndex);
    expect(batchCallCount).toBeGreaterThanOrEqual(2);
  });

  it("default no-platform services keep state across PUT and GET requests", async () => {
    const yearMonth = "2030-04";

    const putResponse = await monthPutBudgetDefaultRoute({
      params: { yearMonth },
      request: new Request(`http://localhost/api/months/${yearMonth}/budget`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ budgetYen: 120000 })
      })
    } as any);

    expect(putResponse.status).toBe(200);

    const getResponse = await monthGetDefaultRoute({
      params: { yearMonth },
      request: new Request(`http://localhost/api/months/${yearMonth}`, {
        method: "GET"
      })
    } as any);

    expect(getResponse.status).toBe(200);
    const body = await parseJson(getResponse);
    expect(body.budgetStatus).toBe("set");
    expect(body.budgetYen).toBe(120000);
    expect(body.monthStatus).toBe("ready");
  });

  it("GET month is side-effect free", async () => {
    const fixture = createFixture();

    const response = await fixture.getMonth({
      params: { yearMonth: "2026-04" },
      request: new Request("http://localhost/api/months/2026-04", {
        method: "GET"
      })
    } as any);

    expect(response.status).toBe(200);
    expect(await fixture.services.monthRepository.countMonths()).toBe(0);
  });

  it("POST initialize creates the month explicitly", async () => {
    const fixture = createFixture();
    await fixture.services.monthRepository.createMonthIfAbsent({
      yearMonth: "2026-03",
      budgetYen: 120000,
      budgetStatus: "set",
      initializedFromPreviousMonth: false,
      carriedFromYearMonth: null,
      nowIso: "2026-03-01T00:00:00.000Z"
    });

    const response = await fixture.initializeMonth({
      params: { yearMonth: "2026-04" },
      request: new Request("http://localhost/api/months/2026-04/initialize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ budgetYen: 130000 })
      })
    } as any);

    const body = await parseJson(response);
    expect(response.status).toBe(200);
    expect(body.yearMonth).toBe("2026-04");
    expect(body.budgetYen).toBe(130000);
    expect(await fixture.services.monthRepository.countMonths()).toBe(2);
  });

  it("PUT budget creates and updates month budget", async () => {
    const fixture = createFixture();

    const response = await fixture.putBudget({
      params: { yearMonth: "2026-04" },
      request: new Request("http://localhost/api/months/2026-04/budget", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ budgetYen: 120000 })
      })
    } as any);

    const body = await parseJson(response);
    expect(response.status).toBe(200);
    expect(body.budgetStatus).toBe("set");
    expect(body.budgetYen).toBe(120000);
    expect(body.monthStatus).toBe("ready");
    expect(body.daysRemaining).toBe(13);
    expect(body).toHaveProperty("dailyRows");
  });

  it("rejects day add when budget is not set with unified error response", async () => {
    const fixture = createFixture();
    await fixture.initializeMonth({
      params: { yearMonth: "2026-04" },
      request: new Request("http://localhost/api/months/2026-04/initialize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({})
      })
    } as any);

    const response = await fixture.addDay({
      params: { date: "2026-04-18" },
      request: new Request("http://localhost/api/days/2026-04-18/add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ inputYen: 1000 })
      })
    } as any);

    const body = await parseJson(response);
    expect(response.status).toBe(409);
    expect(body).toEqual({
      error: {
        code: "BUDGET_NOT_SET",
        message: "月予算を設定してください。"
      }
    });
  });

  it("validates yearMonth/date/amount and rejects month mismatched day", async () => {
    const fixture = createFixture();

    const invalidYearMonth = await fixture.getMonth({
      params: { yearMonth: "2026-13" },
      request: new Request("http://localhost/api/months/2026-13", {
        method: "GET"
      })
    } as any);
    expect(invalidYearMonth.status).toBe(400);

    const invalidDate = await fixture.getHistory({
      params: { date: "2026-02-30" },
      request: new Request("http://localhost/api/days/2026-02-30/history", {
        method: "GET"
      })
    } as any);
    expect(invalidDate.status).toBe(400);

    const invalidAmount = await fixture.putBudget({
      params: { yearMonth: "2026-04" },
      request: new Request("http://localhost/api/months/2026-04/budget", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ budgetYen: -1 })
      })
    } as any);
    expect(invalidAmount.status).toBe(400);

    await fixture.putBudget({
      params: { yearMonth: "2026-04" },
      request: new Request("http://localhost/api/months/2026-04/budget", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ budgetYen: 100000 })
      })
    } as any);

    const mismatch = await fixture.addDay({
      params: { date: "2026-04-20" },
      request: new Request("http://localhost/api/days/2026-04-20/add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ inputYen: 1000, yearMonth: "2026-05" })
      })
    } as any);
    expect(mismatch.status).toBe(400);

    const invalidYearMonthFormat = await fixture.addDay({
      params: { date: "2026-04-20" },
      request: new Request("http://localhost/api/days/2026-04-20/add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ inputYen: 1000, yearMonth: "2026-4" })
      })
    } as any);
    expect(invalidYearMonthFormat.status).toBe(400);
  });

  it("supports add/overwrite/history flow", async () => {
    const fixture = createFixture();
    await fixture.putBudget({
      params: { yearMonth: "2026-04" },
      request: new Request("http://localhost/api/months/2026-04/budget", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ budgetYen: 100000 })
      })
    } as any);

    const addResponse = await fixture.addDay({
      params: { date: "2026-04-18" },
      request: new Request("http://localhost/api/days/2026-04-18/add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ inputYen: 1200, memo: "lunch" })
      })
    } as any);
    expect(addResponse.status).toBe(200);

    const overwriteResponse = await fixture.overwriteDay({
      params: { date: "2026-04-18" },
      request: new Request("http://localhost/api/days/2026-04-18/overwrite", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ inputYen: 3000, memo: "fix" })
      })
    } as any);
    expect(overwriteResponse.status).toBe(200);

    const historyResponse = await fixture.getHistory({
      params: { date: "2026-04-18" },
      request: new Request("http://localhost/api/days/2026-04-18/history", {
        method: "GET"
      })
    } as any);
    const body = await parseJson(historyResponse);

    expect(historyResponse.status).toBe(200);
    expect(body.histories).toHaveLength(2);
    expect(body.histories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operationType: "overwrite", afterTotalYen: 3000 }),
        expect.objectContaining({ operationType: "add", afterTotalYen: 1200 })
      ])
    );
  });
});
