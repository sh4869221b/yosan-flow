import { describe, expect, it } from "vitest";
import { runApiEffect } from "#lib/server/effect/runtime.ts";
import { createFixture } from "./periods-fixture";

describe("period day and history APIs", () => {
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
    const periodBody = await periodResponse.json();
    expect(periodBody).toMatchObject({
      periodId: "p-2026-04",
      plannedTotalYen: 3000,
      periodLengthDays: 30,
    });
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
    const historyBody = await historyResponse.json();
    expect(historyBody).toHaveProperty("histories.length", 2);
    expect(historyBody).toMatchObject({
      histories: expect.arrayContaining([
        expect.objectContaining({
          operationType: "overwrite",
          afterTotalYen: 3000,
        }),
        expect.objectContaining({ operationType: "add", afterTotalYen: 1000 }),
      ]),
    });

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
    await expect(patchResponse.json()).resolves.toMatchObject({
      summary: { plannedTotalYen: 3500 },
      histories: expect.arrayContaining([
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
    });

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
    await expect(deleteResponse.json()).resolves.toMatchObject({
      summary: { plannedTotalYen: 2000 },
      histories: [{ inputYen: 2000, beforeTotalYen: 0, afterTotalYen: 2000 }],
    });
  });

  it("deletes the last history row through the period API", async () => {
    const historyId = "history-last";
    const fixture = createFixture(undefined, () => historyId);
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
    await expect(historyResponse.json()).resolves.toMatchObject({
      histories: [{ id: historyId }],
    });

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
    await expect(deleteResponse.json()).resolves.toMatchObject({
      summary: { plannedTotalYen: 0 },
      histories: [],
    });

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
});
