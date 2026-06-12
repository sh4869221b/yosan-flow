import { describe, expect, it } from "vitest";
import type { D1Database } from "$lib/server/db/d1-types";
import {
  GET as periodsGetDefaultRoute,
  POST as periodsPostDefaultRoute,
} from "../../../src/routes/api/periods/+server";
import { GET as periodGetDefaultRoute } from "../../../src/routes/api/periods/[periodId]/+server";
import { POST as dayAddDefaultRoute } from "../../../src/routes/api/periods/[periodId]/days/[date]/add/+server";
import { createPeriodAwareD1Fake } from "../helpers/period-d1-fake";

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
    ).toBe(false);
    expect(preparedSql.some((sql) => sql.includes("budget_periods"))).toBe(
      true,
    );
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

  it("adds daily amounts cumulatively in D1 path", async () => {
    const fakeDb = createPeriodAwareD1Fake();
    await createPeriod(fakeDb, {
      id: "p-add",
      startDate: "2026-04-20",
      endDate: "2026-05-19",
      budgetYen: 100000,
    });

    for (const inputYen of [1000, 2500]) {
      const response = await dayAddDefaultRoute({
        params: { periodId: "p-add", date: "2026-04-20" },
        request: new Request(
          "http://localhost/api/periods/p-add/days/2026-04-20/add",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ inputYen }),
          },
        ),
        platform: { env: { DB: fakeDb } },
      } as any);
      expect(response.status).toBe(200);
    }

    const periodResponse = await periodGetDefaultRoute({
      params: { periodId: "p-add" },
      request: new Request("http://localhost/api/periods/p-add", {
        method: "GET",
      }),
      platform: { env: { DB: fakeDb } },
    } as any);
    expect(periodResponse.status).toBe(200);
    await expect(periodResponse.json()).resolves.toMatchObject({
      plannedTotalYen: 3500,
    });
  });
});

type CreatePeriodBody = {
  id: string;
  startDate: string;
  endDate: string;
  budgetYen: number;
  predecessorPeriodId?: string | null;
};

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
