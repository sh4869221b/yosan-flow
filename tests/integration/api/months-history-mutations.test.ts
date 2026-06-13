import { describe, expect, it } from "vitest";
import { runApiEffect } from "$lib/server/effect/runtime";
import { createD1ApiServices } from "$lib/server/services/month-summary-service";
import { GET as periodGetDefaultRoute } from "../../../src/routes/api/periods/[periodId]/+server";
import { PUT as periodPutDefaultRoute } from "../../../src/routes/api/periods/[periodId]/+server";
import { _createPeriodDayHistoryHandler } from "../../../src/routes/api/periods/[periodId]/days/[date]/history/+server";
import {
  DELETE as dayHistoryDeleteDefaultRoute,
  PATCH as dayHistoryPatchDefaultRoute,
} from "../../../src/routes/api/periods/[periodId]/days/[date]/history/[historyId]/+server";
import { createPeriodAwareD1Fake } from "../helpers/period-d1-fake";

describe("period daily history mutations", () => {
  it("rolls back daily total when batch history insert fails with duplicate id", async () => {
    const fakeDb = createPeriodAwareD1Fake();
    const historyIds = ["history-dup", "history-dup"];
    const services = createD1ApiServices(fakeDb, {
      now: () => new Date("2026-04-20T00:00:00.000Z"),
      createHistoryId: () => historyIds.shift() ?? "history-fallback",
    });
    await runApiEffect(
      services.createPeriod({
        id: "p-atomicity",
        startDate: "2026-04-20",
        endDate: "2026-05-19",
        budgetYen: 100000,
      }),
    );

    await expect(
      runApiEffect(
        services.dayEntryService.addDailyAmount({
          periodId: "p-atomicity",
          date: "2026-04-20",
          inputYen: 1000,
          memo: "first",
        }),
      ),
    ).resolves.toEqual({});

    await expect(
      runApiEffect(
        services.dayEntryService.addDailyAmount({
          periodId: "p-atomicity",
          date: "2026-04-20",
          inputYen: 500,
          memo: "second",
        }),
      ),
    ).rejects.toThrow(/UNIQUE constraint failed/);

    const periodResponse = await periodGetDefaultRoute({
      params: { periodId: "p-atomicity" },
      request: new Request("http://localhost/api/periods/p-atomicity", {
        method: "GET",
      }),
      platform: { env: { DB: fakeDb } },
    } as any);
    expect(periodResponse.status).toBe(200);
    await expect(periodResponse.json()).resolves.toMatchObject({
      plannedTotalYen: 1000,
    });

    const getHistory = _createPeriodDayHistoryHandler({ services });
    const historyResponse = await getHistory({
      params: { periodId: "p-atomicity", date: "2026-04-20" },
      request: new Request(
        "http://localhost/api/periods/p-atomicity/days/2026-04-20/history",
        { method: "GET" },
      ),
    } as any);
    expect(historyResponse.status).toBe(200);
    const historyJson = (await historyResponse.json()) as {
      histories: unknown[];
    };
    expect(historyJson.histories).toHaveLength(1);
    expect(historyJson).toMatchObject({
      histories: [{ id: "history-dup", inputYen: 1000 }],
    });
  });

  it("edits and deletes daily history rows in D1 path", async () => {
    const fakeDb = createPeriodAwareD1Fake();
    const historyIds = ["history-a", "history-b"];
    const services = createD1ApiServices(fakeDb, {
      now: () => new Date("2026-04-20T00:00:00.000Z"),
      createHistoryId: () => historyIds.shift() ?? "history-fallback",
    });
    await runApiEffect(
      services.createPeriod({
        id: "p-history-mutation-d1",
        startDate: "2026-04-20",
        endDate: "2026-05-19",
        budgetYen: 100000,
      }),
    );
    await runApiEffect(
      services.dayEntryService.addDailyAmount({
        periodId: "p-history-mutation-d1",
        date: "2026-04-20",
        inputYen: 1000,
      }),
    );
    await runApiEffect(
      services.dayEntryService.addDailyAmount({
        periodId: "p-history-mutation-d1",
        date: "2026-04-20",
        inputYen: 2000,
      }),
    );

    const patchResponse = await dayHistoryPatchDefaultRoute({
      params: {
        periodId: "p-history-mutation-d1",
        date: "2026-04-20",
        historyId: "history-a",
      },
      request: new Request(
        "http://localhost/api/periods/p-history-mutation-d1/days/2026-04-20/history/history-a",
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ inputYen: 1500, memo: "edited" }),
        },
      ),
      platform: { env: { DB: fakeDb } },
    } as any);
    expect(patchResponse.status).toBe(200);
    await expect(patchResponse.json()).resolves.toMatchObject({
      summary: { plannedTotalYen: 3500 },
      histories: [
        { id: "history-b", beforeTotalYen: 1500, afterTotalYen: 3500 },
        {
          id: "history-a",
          inputYen: 1500,
          beforeTotalYen: 0,
          afterTotalYen: 1500,
          memo: "edited",
        },
      ],
    });

    const deleteResponse = await dayHistoryDeleteDefaultRoute({
      params: {
        periodId: "p-history-mutation-d1",
        date: "2026-04-20",
        historyId: "history-a",
      },
      request: new Request(
        "http://localhost/api/periods/p-history-mutation-d1/days/2026-04-20/history/history-a",
        { method: "DELETE" },
      ),
      platform: { env: { DB: fakeDb } },
    } as any);
    expect(deleteResponse.status).toBe(200);
    await expect(deleteResponse.json()).resolves.toMatchObject({
      summary: { plannedTotalYen: 2000 },
      histories: [{ id: "history-b", beforeTotalYen: 0, afterTotalYen: 2000 }],
    });
  });

  it("deletes the last daily history row in D1 path", async () => {
    const fakeDb = createPeriodAwareD1Fake();
    const services = createD1ApiServices(fakeDb, {
      now: () => new Date("2026-04-20T00:00:00.000Z"),
      createHistoryId: () => "history-last",
    });
    await runApiEffect(
      services.createPeriod({
        id: "p-history-last-d1",
        startDate: "2026-04-20",
        endDate: "2026-05-19",
        budgetYen: 100000,
      }),
    );
    await runApiEffect(
      services.dayEntryService.addDailyAmount({
        periodId: "p-history-last-d1",
        date: "2026-04-20",
        inputYen: 1000,
      }),
    );

    const deleteResponse = await dayHistoryDeleteDefaultRoute({
      params: {
        periodId: "p-history-last-d1",
        date: "2026-04-20",
        historyId: "history-last",
      },
      request: new Request(
        "http://localhost/api/periods/p-history-last-d1/days/2026-04-20/history/history-last",
        { method: "DELETE" },
      ),
      platform: { env: { DB: fakeDb } },
    } as any);

    expect(deleteResponse.status).toBe(200);
    await expect(deleteResponse.json()).resolves.toMatchObject({
      summary: { plannedTotalYen: 0 },
      histories: [],
    });

    const shrinkResponse = await periodPutDefaultRoute({
      params: { periodId: "p-history-last-d1" },
      request: new Request("http://localhost/api/periods/p-history-last-d1", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          startDate: "2026-04-21",
          endDate: "2026-05-19",
          budgetYen: 100000,
        }),
      }),
      platform: { env: { DB: fakeDb } },
    } as any);
    expect(shrinkResponse.status).toBe(200);
  });
});
