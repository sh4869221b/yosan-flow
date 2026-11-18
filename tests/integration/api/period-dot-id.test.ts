import { expect, it } from "vitest";
import {
  dayAddUrl,
  dayHistoryUrl,
  historyItemUrl,
  periodSummaryUrl,
} from "#lib/dashboard/api-urls.ts";
import { runApiEffect } from "#lib/server/effect/runtime.ts";
import { createFixture } from "./periods-fixture";

const startDate = "2026-04-20";
const endDate = "2026-05-19";
const period = { startDate, endDate, budgetYen: 1000 };

function request(path: string, method: string, body?: unknown) {
  return new Request(new URL(path, "http://localhost"), {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

it.each([".", ".."])(
  "rejects creation of period %s and keeps existing IDs addressable",
  async (id) => {
    const fixture = createFixture(undefined, () => "history");
    const create = await fixture.createPeriod({
      request: request("/api/periods", "POST", { id, ...period }),
    } as Parameters<typeof fixture.createPeriod>[0]);
    expect(create.status).toBe(400);
    expect(await create.json()).toMatchObject({
      error: { code: "INVALID_PERIOD_ID" },
    });

    // This record represents a period created before the validation changed.
    await runApiEffect(fixture.services.createPeriod({ id, ...period }));
    await runApiEffect(
      fixture.services.createPeriod({
        id: "_legacy",
        startDate: "2026-05-20",
        endDate: "2026-05-31",
        budgetYen: 999,
        predecessorPeriodId: id,
      }),
    );
    const get = async (periodId: string) =>
      fixture.getPeriod({
        params: { periodId: "_legacy" },
        request: request(periodSummaryUrl(periodId), "GET"),
      } as Parameters<typeof fixture.getPeriod>[0]);
    expect(await (await get(id)).json()).toMatchObject({
      periodId: id,
      budgetYen: 1000,
    });
    expect(await (await get("_legacy")).json()).toMatchObject({
      periodId: "_legacy",
      budgetYen: 999,
    });

    const params = { periodId: "_legacy", date: startDate };
    const add = await fixture.addDay({
      params,
      request: request(dayAddUrl(id, startDate), "POST", { inputYen: 300 }),
    } as Parameters<typeof fixture.addDay>[0]);
    expect(add.status).toBe(200);
    const history = await fixture.getHistory({
      params,
      request: request(dayHistoryUrl(id, startDate), "GET"),
    } as Parameters<typeof fixture.getHistory>[0]);
    expect(await history.json()).toMatchObject({
      periodId: id,
      histories: [{ id: "history", inputYen: 300 }],
    });
    const patch = fixture.mutateHistory.PATCH;
    const edit = await patch({
      params: { ...params, historyId: "history" },
      request: request(historyItemUrl(id, startDate, "history"), "PATCH", {
        inputYen: 350,
      }),
    } as Parameters<typeof patch>[0]);
    expect(await edit.json()).toMatchObject({
      summary: { periodId: id },
      histories: [{ id: "history", inputYen: 350 }],
    });
  },
);
