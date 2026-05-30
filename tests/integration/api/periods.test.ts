import { describe, expect, it } from "vitest";
import {
  createInMemoryApiServices,
  type InMemoryApiServices,
} from "$lib/server/services/month-summary-service";
import { runApiEffect } from "$lib/server/effect/runtime";
import {
  _createPeriodsHandler,
  _createPeriodsListHandler,
} from "../../../src/routes/api/periods/+server";
import {
  _createPeriodGetHandler,
  _createPeriodPutHandler,
} from "../../../src/routes/api/periods/[periodId]/+server";
import { _createPeriodDayAddHandler } from "../../../src/routes/api/periods/[periodId]/days/[date]/add/+server";
import { _createPeriodDayOverwriteHandler } from "../../../src/routes/api/periods/[periodId]/days/[date]/overwrite/+server";
import { _createPeriodDayHistoryHandler } from "../../../src/routes/api/periods/[periodId]/days/[date]/history/+server";
import { _createPeriodDayHistoryMutationHandler } from "../../../src/routes/api/periods/[periodId]/days/[date]/history/[historyId]/+server";

async function parseJson(response: Response): Promise<any> {
  return response.json();
}

function createFixture(
  now = new Date("2026-04-20T00:00:00.000Z"),
  createHistoryId?: () => string,
): {
  services: InMemoryApiServices;
  createPeriod: ReturnType<typeof _createPeriodsHandler>;
  listPeriods: ReturnType<typeof _createPeriodsListHandler>;
  getPeriod: ReturnType<typeof _createPeriodGetHandler>;
  updatePeriod: ReturnType<typeof _createPeriodPutHandler>;
  addDay: ReturnType<typeof _createPeriodDayAddHandler>;
  overwriteDay: ReturnType<typeof _createPeriodDayOverwriteHandler>;
  getHistory: ReturnType<typeof _createPeriodDayHistoryHandler>;
  mutateHistory: ReturnType<typeof _createPeriodDayHistoryMutationHandler>;
} {
  const services = createInMemoryApiServices({
    now: () => now,
    createHistoryId,
  });

  return {
    services,
    createPeriod: _createPeriodsHandler({ services }),
    listPeriods: _createPeriodsListHandler({ services }),
    getPeriod: _createPeriodGetHandler({ services }),
    updatePeriod: _createPeriodPutHandler({ services }),
    addDay: _createPeriodDayAddHandler({ services }),
    overwriteDay: _createPeriodDayOverwriteHandler({ services }),
    getHistory: _createPeriodDayHistoryHandler({ services }),
    mutateHistory: _createPeriodDayHistoryMutationHandler({ services }),
  };
}

describe("period APIs", () => {
  it("creates and lists periods", async () => {
    const fixture = createFixture();

    const createResponse = await fixture.createPeriod({
      request: new Request("http://localhost/api/periods", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: "p-2026-04",
          startDate: "2026-04-20",
          endDate: "2026-05-19",
          budgetYen: 100000,
        }),
      }),
    } as any);
    expect(createResponse.status).toBe(201);

    const listResponse = await fixture.listPeriods({
      request: new Request("http://localhost/api/periods", { method: "GET" }),
    } as any);
    expect(listResponse.status).toBe(200);
    const listBody = await parseJson(listResponse);
    expect(listBody.periods).toHaveLength(1);
    expect(listBody.periods[0].id).toBe("p-2026-04");
  });

  it("returns summary and day histories under period path", async () => {
    const fixture = createFixture();
    await runApiEffect(
      fixture.services.createPeriod({
        id: "p-2026-04",
        startDate: "2026-04-20",
        endDate: "2026-05-19",
        budgetYen: 100000,
      }),
    );

    const addResponse = await fixture.addDay({
      params: { periodId: "p-2026-04", date: "2026-04-20" },
      request: new Request(
        "http://localhost/api/periods/p-2026-04/days/2026-04-20/add",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ inputYen: 1000, memo: "lunch" }),
        },
      ),
    } as any);
    expect(addResponse.status).toBe(200);

    const overwriteResponse = await fixture.overwriteDay({
      params: { periodId: "p-2026-04", date: "2026-04-20" },
      request: new Request(
        "http://localhost/api/periods/p-2026-04/days/2026-04-20/overwrite",
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ inputYen: 3000, memo: "fix" }),
        },
      ),
    } as any);
    expect(overwriteResponse.status).toBe(200);

    const periodResponse = await fixture.getPeriod({
      params: { periodId: "p-2026-04" },
      request: new Request("http://localhost/api/periods/p-2026-04", {
        method: "GET",
      }),
    } as any);
    expect(periodResponse.status).toBe(200);
    const periodBody = await parseJson(periodResponse);
    expect(periodBody.periodId).toBe("p-2026-04");
    expect(periodBody.plannedTotalYen).toBe(3000);
    expect(periodBody.periodLengthDays).toBe(30);
    expect(periodBody).toHaveProperty("varianceFromRecommendationYen");
    expect(periodBody).toHaveProperty("remainingAfterDayYenPreview");

    const historyResponse = await fixture.getHistory({
      params: { periodId: "p-2026-04", date: "2026-04-20" },
      request: new Request(
        "http://localhost/api/periods/p-2026-04/days/2026-04-20/history",
        {
          method: "GET",
        },
      ),
    } as any);
    expect(historyResponse.status).toBe(200);
    const historyBody = await parseJson(historyResponse);
    expect(historyBody.histories).toHaveLength(2);
    expect(historyBody.histories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operationType: "overwrite",
          afterTotalYen: 3000,
        }),
        expect.objectContaining({ operationType: "add", afterTotalYen: 1000 }),
      ]),
    );

    const missingHistoryResponse = await fixture.getHistory({
      params: { periodId: "missing-period", date: "2026-04-20" },
      request: new Request(
        "http://localhost/api/periods/missing-period/days/2026-04-20/history",
        {
          method: "GET",
        },
      ),
    } as any);
    expect(missingHistoryResponse.status).toBe(404);
  });

  it("edits and deletes period day history rows", async () => {
    const historyIds = ["history-a", "history-b"];
    const fixture = createFixture(
      new Date("2026-04-20T00:00:00.000Z"),
      () => historyIds.shift() ?? "history-fallback",
    );
    await runApiEffect(
      fixture.services.createPeriod({
        id: "p-history-mutation",
        startDate: "2026-04-20",
        endDate: "2026-05-19",
        budgetYen: 100000,
      }),
    );

    for (const inputYen of [1000, 2000]) {
      const response = await fixture.addDay({
        params: { periodId: "p-history-mutation", date: "2026-04-20" },
        request: new Request(
          "http://localhost/api/periods/p-history-mutation/days/2026-04-20/add",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ inputYen }),
          },
        ),
      } as any);
      expect(response.status).toBe(200);
    }

    const initialHistoryResponse = await fixture.getHistory({
      params: { periodId: "p-history-mutation", date: "2026-04-20" },
      request: new Request(
        "http://localhost/api/periods/p-history-mutation/days/2026-04-20/history",
        { method: "GET" },
      ),
    } as any);
    expect(initialHistoryResponse.status).toBe(200);
    const firstHistoryId = "history-a";

    const patchResponse = await fixture.mutateHistory.PATCH({
      params: {
        periodId: "p-history-mutation",
        date: "2026-04-20",
        historyId: firstHistoryId,
      },
      request: new Request(
        `http://localhost/api/periods/p-history-mutation/days/2026-04-20/history/${firstHistoryId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ inputYen: 1500, memo: "edited" }),
        },
      ),
    } as any);
    expect(patchResponse.status).toBe(200);
    const patchBody = await parseJson(patchResponse);
    expect(patchBody.summary.plannedTotalYen).toBe(3500);
    expect(patchBody.histories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: firstHistoryId,
          inputYen: 1500,
          afterTotalYen: 1500,
          memo: "edited",
        }),
        expect.objectContaining({
          inputYen: 2000,
          beforeTotalYen: 1500,
          afterTotalYen: 3500,
        }),
      ]),
    );

    const deleteResponse = await fixture.mutateHistory.DELETE({
      params: {
        periodId: "p-history-mutation",
        date: "2026-04-20",
        historyId: firstHistoryId,
      },
      request: new Request(
        `http://localhost/api/periods/p-history-mutation/days/2026-04-20/history/${firstHistoryId}`,
        { method: "DELETE" },
      ),
    } as any);
    expect(deleteResponse.status).toBe(200);
    const deleteBody = await parseJson(deleteResponse);
    expect(deleteBody.summary.plannedTotalYen).toBe(2000);
    expect(deleteBody.histories).toHaveLength(1);
    expect(deleteBody.histories[0]).toMatchObject({
      inputYen: 2000,
      beforeTotalYen: 0,
      afterTotalYen: 2000,
    });
  });

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

  it("deletes the last history row through the period API", async () => {
    const fixture = createFixture();
    await runApiEffect(
      fixture.services.createPeriod({
        id: "p-history-delete-last",
        startDate: "2026-04-20",
        endDate: "2026-05-19",
        budgetYen: 100000,
      }),
    );

    await fixture.addDay({
      params: { periodId: "p-history-delete-last", date: "2026-04-20" },
      request: new Request(
        "http://localhost/api/periods/p-history-delete-last/days/2026-04-20/add",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ inputYen: 1000 }),
        },
      ),
    } as any);
    const historyResponse = await fixture.getHistory({
      params: { periodId: "p-history-delete-last", date: "2026-04-20" },
      request: new Request(
        "http://localhost/api/periods/p-history-delete-last/days/2026-04-20/history",
        { method: "GET" },
      ),
    } as any);
    const historyBody = await parseJson(historyResponse);
    const historyId = historyBody.histories[0].id;

    const deleteResponse = await fixture.mutateHistory.DELETE({
      params: {
        periodId: "p-history-delete-last",
        date: "2026-04-20",
        historyId,
      },
      request: new Request(
        `http://localhost/api/periods/p-history-delete-last/days/2026-04-20/history/${historyId}`,
        { method: "DELETE" },
      ),
    } as any);

    expect(deleteResponse.status).toBe(200);
    const body = await parseJson(deleteResponse);
    expect(body.summary.plannedTotalYen).toBe(0);
    expect(body.histories).toHaveLength(0);

    const shrinkResponse = await fixture.updatePeriod({
      params: { periodId: "p-history-delete-last" },
      request: new Request(
        "http://localhost/api/periods/p-history-delete-last",
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            startDate: "2026-04-21",
            endDate: "2026-05-19",
            budgetYen: 100000,
          }),
        },
      ),
    } as any);
    expect(shrinkResponse.status).toBe(200);
  });

  it("updates period by PUT /api/periods/:periodId", async () => {
    const fixture = createFixture();
    await runApiEffect(
      fixture.services.createPeriod({
        id: "p-put",
        startDate: "2026-04-20",
        endDate: "2026-05-19",
        budgetYen: 100000,
      }),
    );

    const putResponse = await fixture.updatePeriod({
      params: { periodId: "p-put" },
      request: new Request("http://localhost/api/periods/p-put", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          startDate: "2026-04-21",
          endDate: "2026-05-20",
          budgetYen: 120000,
        }),
      }),
    } as any);

    expect(putResponse.status).toBe(200);
    const body = await parseJson(putResponse);
    expect(body.startDate).toBe("2026-04-21");
    expect(body.endDate).toBe("2026-05-20");
    expect(body.budgetYen).toBe(120000);
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
