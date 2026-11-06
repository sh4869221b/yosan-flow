import { describe, expect, it } from "vitest";
import { runApiEffect } from "#lib/server/effect/runtime.ts";
import { createFixture } from "./periods-fixture";

describe("unsafe integer yen input", () => {
  it.each(["create", "update", "add", "overwrite", "history"] as const)(
    "rejects an imprecise %s amount without changing saved data",
    async (operation) => {
      const fixture = createFixture(undefined, () => "history-1");
      const period = {
        id: "period-1",
        startDate: "2026-04-20",
        endDate: "2026-05-19",
        budgetYen: 100000,
      };
      await runApiEffect(fixture.services.createPeriod(period));
      const params = {
        periodId: period.id,
        date: period.startDate,
        historyId: "history-1",
      };
      await fixture.addDay({
        params,
        request: new Request("http://localhost", {
          method: "POST",
          body: '{"inputYen":1000}',
        }),
      } as any);
      const before = await fixture.getPeriod({ params } as any);
      const beforeBody = await before.json();
      const historyBefore = await fixture.getHistory({ params } as any);
      const historyBeforeBody = await historyBefore.json();

      const handlers = {
        create: fixture.createPeriod,
        update: fixture.updatePeriod,
        add: fixture.addDay,
        overwrite: fixture.overwriteDay,
        history: fixture.mutateHistory.PATCH,
      };
      // Keep the JSON number literal: JSON.stringify would round it before
      // the request reaches the application's parsing boundary.
      const body =
        operation === "create"
          ? '{"id":"new-period","startDate":"2026-06-01","endDate":"2026-06-30","budgetYen":9007199254740993}'
          : operation === "update"
            ? '{"startDate":"2026-04-20","endDate":"2026-05-19","budgetYen":9007199254740993}'
            : '{"inputYen":9007199254740993}';
      const response = await handlers[operation]({
        params,
        request: new Request("http://localhost", {
          method:
            operation === "history"
              ? "PATCH"
              : operation === "update" || operation === "overwrite"
                ? "PUT"
                : "POST",
          headers: { "content-type": "application/json" },
          body,
        }),
      } as any);
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "INVALID_AMOUNT" },
      });
      const after = await fixture.getPeriod({ params } as any);
      await expect(after.json()).resolves.toEqual(beforeBody);
      const historyAfter = await fixture.getHistory({ params } as any);
      await expect(historyAfter.json()).resolves.toEqual(historyBeforeBody);
      const periods = await fixture.listPeriods({} as any);
      await expect(periods.json()).resolves.toMatchObject({
        periods: [{ id: period.id }],
      });
    },
  );
});
