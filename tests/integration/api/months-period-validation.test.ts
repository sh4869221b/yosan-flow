import { describe, expect, it } from "vitest";
import type { D1Database } from "$lib/server/db/d1-types";
import { POST as periodsPostDefaultRoute } from "../../../src/routes/api/periods/+server";
import { PUT as periodPutDefaultRoute } from "../../../src/routes/api/periods/[periodId]/+server";
import { createPeriodAwareD1Fake } from "../helpers/period-d1-fake";

describe("period validation through D1 routes", () => {
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
