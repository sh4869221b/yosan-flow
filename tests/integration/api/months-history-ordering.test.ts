import { describe, expect, it } from "vitest";
import { runApiEffect } from "$lib/server/effect/runtime";
import { createD1ApiServices } from "$lib/server/services/month-summary-service";
import { _createPeriodDayHistoryHandler } from "../../../src/routes/api/periods/[periodId]/days/[date]/history/+server";
import { GET as dayHistoryDefaultRoute } from "../../../src/routes/api/periods/[periodId]/days/[date]/history/+server";
import { PATCH as dayHistoryPatchDefaultRoute } from "../../../src/routes/api/periods/[periodId]/days/[date]/history/[historyId]/+server";
import { createPeriodAwareD1Fake } from "../helpers/period-d1-fake";

describe("period daily history ordering", () => {
  it("returns period-scoped daily history in stable D1 ordering", async () => {
    const fakeDb = createPeriodAwareD1Fake();
    const historyIds = ["history-a", "history-z", "history-other"];
    const services = createD1ApiServices(fakeDb, {
      now: () => new Date("2026-04-20T00:00:00.000Z"),
      createHistoryId: () => historyIds.shift() ?? "history-fallback",
    });
    await runApiEffect(
      services.createPeriod({
        id: "p-history",
        startDate: "2026-04-20",
        endDate: "2026-05-19",
        budgetYen: 100000,
      }),
    );
    await runApiEffect(
      services.createPeriod({
        id: "p-history-other",
        startDate: "2026-05-20",
        endDate: "2026-06-19",
        budgetYen: 100000,
        predecessorPeriodId: "p-history",
      }),
    );

    await runApiEffect(
      services.dayEntryService.addDailyAmount({
        periodId: "p-history",
        date: "2026-04-20",
        inputYen: 1000,
        memo: "lunch",
      }),
    );
    await runApiEffect(
      services.dayEntryService.overwriteDailyAmount({
        periodId: "p-history",
        date: "2026-04-20",
        inputYen: 3000,
        memo: null,
      }),
    );
    await runApiEffect(
      services.dayEntryService.addDailyAmount({
        periodId: "p-history-other",
        date: "2026-05-20",
        inputYen: 9999,
        memo: "other period",
      }),
    );

    const getHistory = _createPeriodDayHistoryHandler({ services });
    const historyResponse = await dayHistoryDefaultRoute({
      params: { periodId: "p-history", date: "2026-04-20" },
      request: new Request(
        "http://localhost/api/periods/p-history/days/2026-04-20/history",
        { method: "GET" },
      ),
      platform: { env: { DB: fakeDb } },
    } as any);
    const injectedHistoryResponse = await getHistory({
      params: { periodId: "p-history", date: "2026-04-20" },
      request: new Request(
        "http://localhost/api/periods/p-history/days/2026-04-20/history",
        { method: "GET" },
      ),
    } as any);

    expect(historyResponse.status).toBe(200);
    expect(injectedHistoryResponse.status).toBe(200);
    await expect(injectedHistoryResponse.json()).resolves.toMatchObject({
      histories: [
        {
          id: "history-z",
          budgetPeriodId: "p-history",
          date: "2026-04-20",
          operationType: "overwrite",
          inputYen: 3000,
          beforeTotalYen: 1000,
          afterTotalYen: 3000,
          memo: null,
        },
        {
          id: "history-a",
          budgetPeriodId: "p-history",
          date: "2026-04-20",
          operationType: "add",
          inputYen: 1000,
          beforeTotalYen: 0,
          afterTotalYen: 1000,
          memo: "lunch",
        },
      ],
    });
  });

  it("uses insertion order instead of UUID order for same-timestamp D1 history replay", async () => {
    const fakeDb = createPeriodAwareD1Fake();
    const historyIds = ["history-z", "history-a"];
    const services = createD1ApiServices(fakeDb, {
      now: () => new Date("2026-04-20T00:00:00.000Z"),
      createHistoryId: () => historyIds.shift() ?? "history-fallback",
    });
    await runApiEffect(
      services.createPeriod({
        id: "p-history-rowid",
        startDate: "2026-04-20",
        endDate: "2026-05-19",
        budgetYen: 100000,
      }),
    );

    await runApiEffect(
      services.dayEntryService.addDailyAmount({
        periodId: "p-history-rowid",
        date: "2026-04-20",
        inputYen: 1000,
      }),
    );
    await runApiEffect(
      services.dayEntryService.overwriteDailyAmount({
        periodId: "p-history-rowid",
        date: "2026-04-20",
        inputYen: 500,
      }),
    );

    const patchResponse = await dayHistoryPatchDefaultRoute({
      params: {
        periodId: "p-history-rowid",
        date: "2026-04-20",
        historyId: "history-z",
      },
      request: new Request(
        "http://localhost/api/periods/p-history-rowid/days/2026-04-20/history/history-z",
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ inputYen: 1200 }),
        },
      ),
      platform: { env: { DB: fakeDb } },
    } as any);

    expect(patchResponse.status).toBe(200);
    await expect(patchResponse.json()).resolves.toMatchObject({
      summary: { plannedTotalYen: 500 },
      histories: [
        {
          id: "history-a",
          operationType: "overwrite",
          beforeTotalYen: 1200,
          afterTotalYen: 500,
        },
        {
          id: "history-z",
          operationType: "add",
          beforeTotalYen: 0,
          afterTotalYen: 1200,
        },
      ],
    });
  });
});
