import { describe, expect, it } from "vitest";
import { runApiEffect } from "$lib/server/effect/runtime";
import { createFixture } from "./periods-fixture";

async function parseJson(response: Response): Promise<any> {
  return response.json();
}

describe("period API validation", () => {
  it("returns errors for invalid or missing history mutations", async () => {
    const fixture = createFixture();
    await runApiEffect(
      fixture.services.createPeriod({
        id: "p-history-errors",
        startDate: "2026-04-20",
        endDate: "2026-05-19",
        budgetYen: 100000,
      }),
    );

    const invalidAmountResponse = await fixture.mutateHistory.PATCH({
      params: {
        periodId: "p-history-errors",
        date: "2026-04-20",
        historyId: "missing-history",
      },
      request: new Request(
        "http://localhost/api/periods/p-history-errors/days/2026-04-20/history/missing-history",
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ inputYen: -1 }),
        },
      ),
    } as any);
    expect(invalidAmountResponse.status).toBe(400);

    const missingResponse = await fixture.mutateHistory.DELETE({
      params: {
        periodId: "p-history-errors",
        date: "2026-04-20",
        historyId: "missing-history",
      },
      request: new Request(
        "http://localhost/api/periods/p-history-errors/days/2026-04-20/history/missing-history",
        { method: "DELETE" },
      ),
    } as any);
    expect(missingResponse.status).toBe(404);
    await expect(missingResponse.json()).resolves.toMatchObject({
      error: { code: "HISTORY_NOT_FOUND" },
    });
  });

  it("returns 404 when updating a missing period", async () => {
    const fixture = createFixture();

    const response = await fixture.updatePeriod({
      params: { periodId: "missing-period" },
      request: new Request("http://localhost/api/periods/missing-period", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          startDate: "2026-04-20",
          endDate: "2026-05-19",
          budgetYen: 100000,
        }),
      }),
    } as any);

    expect(response.status).toBe(404);
    const body = await parseJson(response);
    expect(body.error.code).toBe("PERIOD_NOT_FOUND");
  });

  it("returns 400 for overlap / continuity validation errors", async () => {
    const fixture = createFixture();
    await runApiEffect(
      fixture.services.createPeriod({
        id: "p-a",
        startDate: "2026-04-20",
        endDate: "2026-05-19",
        budgetYen: 100000,
      }),
    );
    await runApiEffect(
      fixture.services.createPeriod({
        id: "p-b",
        startDate: "2026-05-20",
        endDate: "2026-06-19",
        budgetYen: 100000,
        predecessorPeriodId: "p-a",
      }),
    );

    const overlapResponse = await fixture.createPeriod({
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
    } as any);
    expect(overlapResponse.status).toBe(400);
    const overlapBody = await parseJson(overlapResponse);
    expect(overlapBody.error.code).toBe("PERIOD_OVERLAP");

    const continuityResponse = await fixture.updatePeriod({
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
    } as any);
    expect(continuityResponse.status).toBe(400);
    const continuityBody = await parseJson(continuityResponse);
    expect(continuityBody.error.code).toBe("PERIOD_CONTINUITY_VIOLATION");
  });

  it("rejects shrinking a period when entries would fall outside the new range", async () => {
    const fixture = createFixture();
    await runApiEffect(
      fixture.services.createPeriod({
        id: "p-shrink",
        startDate: "2026-04-20",
        endDate: "2026-05-19",
        budgetYen: 100000,
      }),
    );

    const addResponse = await fixture.addDay({
      params: { periodId: "p-shrink", date: "2026-05-19" },
      request: new Request(
        "http://localhost/api/periods/p-shrink/days/2026-05-19/add",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ inputYen: 500 }),
        },
      ),
    } as any);
    expect(addResponse.status).toBe(200);

    const response = await fixture.updatePeriod({
      params: { periodId: "p-shrink" },
      request: new Request("http://localhost/api/periods/p-shrink", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          startDate: "2026-04-20",
          endDate: "2026-05-18",
          budgetYen: 100000,
        }),
      }),
    } as any);

    expect(response.status).toBe(400);
    const body = await parseJson(response);
    expect(body.error.code).toBe("PERIOD_HAS_OUT_OF_RANGE_ENTRIES");
  });
});
