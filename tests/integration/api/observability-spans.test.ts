import { AsyncLocalStorage } from "node:async_hooks";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Effect } from "effect";
import { runApiEffect } from "$lib/server/effect/runtime";
import {
  createTracing,
  type NativeTracing,
} from "$lib/server/observability/tracing";
import { POST } from "../../../src/routes/api/periods/+server";
import { GET } from "../../../src/routes/api/periods/[periodId]/+server";
import { load } from "../../../src/routes/+page.server";
import { createPeriodAwareD1Fake } from "../helpers/period-d1-fake";
import { createFixture } from "./periods-fixture";
import { createRouteEvent } from "./route-event-fixture";
import {
  NOW,
  UPDATE_REQUEST,
  put,
  seedLinkedPeriods,
  type PreviewBody,
} from "./period-boundary-update-fixture";

function recordingTracing(isTraced = true) {
  const context = new AsyncLocalStorage<string>();
  const spans: {
    name: string;
    parent: string | undefined;
    pending: boolean;
    attributes: Record<string, string | number>;
  }[] = [];
  const native: NativeTracing = {
    enterSpan(name, callback) {
      const attributes: Record<string, string | number> = {};
      const span = {
        name,
        parent: context.getStore(),
        pending: true,
        attributes,
      };
      spans.push(span);
      return context.run(name, () => {
        const result = callback({
          isTraced,
          setAttribute: (key, value) => {
            attributes[key] = value;
          },
        });
        if (result instanceof Promise) {
          void result.then(
            () => {
              span.pending = false;
            },
            () => {
              span.pending = false;
            },
          );
        } else {
          span.pending = false;
        }
        return result;
      });
    },
  };
  return { native, spans, context, tracing: createTracing(native) };
}

const period = {
  id: "private-period",
  startDate: "2026-04-20",
  endDate: "2026-05-19",
  budgetYen: 100000,
};
const dayRoute = "/api/periods/[periodId]/days/[date]";

function event(method: string, body?: unknown, platform?: App.Platform) {
  return createRouteEvent({
    params: {
      periodId: period.id,
      date: period.startDate,
      historyId: "private-history",
    },
    platform,
    request: new Request(
      "http://localhost/api/periods/private-period?private-query=secret",
      {
        method,
        headers: {
          "content-type": "application/json",
          authorization: "Bearer private-auth",
          cookie: "private-cookie",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
    ),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("business spans around actual mutation work", () => {
  it.each([true, false])(
    "preserves all six mutation responses and one log with sampled=%s",
    async (sampled) => {
      const { tracing, spans, context } = recordingTracing(sampled);
      const fixture = createFixture(
        undefined,
        () => "private-history",
        tracing,
      );
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const cases = [
        {
          name: "api.budget_period.create",
          route: "/api/periods",
          status: 201,
          body: period,
          run: () => fixture.createPeriod(event("POST", period)),
          summary: false,
        },
        {
          name: "api.budget_period.update",
          route: "/api/periods/[periodId]",
          status: 200,
          body: { periodId: period.id, budgetYen: 120000 },
          run: () =>
            fixture.updatePeriod(
              event("PUT", { ...period, budgetYen: 120000 }),
            ),
          summary: true,
        },
        {
          name: "api.daily_total.upsert",
          route: `${dayRoute}/add`,
          status: 200,
          body: { plannedTotalYen: 1200 },
          run: () =>
            fixture.addDay(
              event("POST", { inputYen: 1200, memo: "private-memo" }),
            ),
          summary: true,
        },
        {
          name: "api.history.update",
          route: `${dayRoute}/history/[historyId]`,
          status: 200,
          body: {
            summary: { plannedTotalYen: 800 },
            histories: [{ id: "private-history", inputYen: 800 }],
          },
          run: () =>
            fixture.mutateHistory.PATCH(
              event("PATCH", { inputYen: 800, memo: "private-edited-memo" }),
            ),
          summary: true,
        },
        {
          name: "api.history.delete",
          route: `${dayRoute}/history/[historyId]`,
          status: 200,
          body: { summary: { plannedTotalYen: 0 }, histories: [] },
          run: () => fixture.mutateHistory.DELETE(event("DELETE")),
          summary: true,
        },
        {
          name: "api.daily_total.upsert",
          route: `${dayRoute}/overwrite`,
          status: 200,
          body: { plannedTotalYen: 600 },
          run: () => fixture.overwriteDay(event("PUT", { inputYen: 600 })),
          summary: true,
        },
      ];
      for (const scenario of cases) {
        spans.length = 0;
        log.mockClear();
        const response = await scenario.run();
        expect(response.status).toBe(scenario.status);
        expect(await response.json()).toMatchObject(scenario.body);
        expect(log).toHaveBeenCalledOnce();
        expect(spans).toEqual([
          {
            name: scenario.name,
            parent: undefined,
            pending: false,
            attributes: sampled
              ? { "app.operation": scenario.name, "app.route": scenario.route }
              : {},
          },
          ...(scenario.summary
            ? [
                {
                  name: "summary.calculate",
                  parent: scenario.name,
                  pending: false,
                  attributes: sampled
                    ? { "app.operation": "summary.calculate" }
                    : {},
                },
              ]
            : []),
        ]);
      }
      spans.length = 0;
      const reads: (string | undefined)[] = [];
      const totals = fixture.services.listDailyTotalsByPeriodId;
      const findPeriod = fixture.services.budgetPeriodRepository.findById;
      vi.spyOn(
        fixture.services,
        "listDailyTotalsByPeriodId",
      ).mockImplementation((id) =>
        totals(id).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              reads.push(context.getStore());
            }),
          ),
        ),
      );
      vi.spyOn(
        fixture.services.budgetPeriodRepository,
        "findById",
      ).mockImplementation((id) =>
        findPeriod(id).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              reads.push(context.getStore());
            }),
          ),
        ),
      );
      await fixture.getPeriod(event("GET"));
      expect(reads).toEqual(["summary.calculate", "summary.calculate"]);
      expect(spans).toEqual([
        {
          name: "summary.calculate",
          parent: undefined,
          pending: false,
          attributes: sampled ? { "app.operation": "summary.calculate" } : {},
        },
      ]);
    },
  );

  it.each(["invalid-json", "invalid-amount"])(
    "retains validation response and a bounded parent for %s",
    async (kind) => {
      const { tracing, spans } = recordingTracing();
      const fixture = createFixture(undefined, undefined, tracing);
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const input = event("POST", { ...period, budgetYen: -1 });
      if (kind === "invalid-json")
        input.request = new Request(input.request.url, {
          method: "POST",
          body: "{",
        });
      const response = await fixture.createPeriod(input);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: {
          code: kind === "invalid-json" ? "INVALID_BODY" : "INVALID_AMOUNT",
        },
      });
      expect(log).toHaveBeenCalledOnce();
      expect(spans).toEqual([
        {
          name: "api.budget_period.create",
          parent: undefined,
          pending: false,
          attributes: {
            "app.operation": "api.budget_period.create",
            "app.route": "/api/periods",
          },
        },
      ]);
    },
  );

  it("keeps parent and summary open through a failed refresh without replaying the write", async () => {
    const { tracing, spans } = recordingTracing();
    const fixture = createFixture(undefined, () => "private-history", tracing);
    await runApiEffect(fixture.services.createPeriod(period));
    const write = vi.spyOn(fixture.services.dayEntryService, "addDailyAmount");
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const error = new Error("private refresh error");
    const refresh = vi
      .spyOn(fixture.services, "listDailyTotalsByPeriodId")
      .mockImplementation(() =>
        Effect.tryPromise({
          try: async () => {
            started.resolve();
            await release.promise;
            throw error;
          },
          catch: () => error,
        }),
      );
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const pending = fixture.addDay(event("POST", { inputYen: 600 }));
    await started.promise;
    expect(spans.map((span) => [span.name, span.parent, span.pending])).toEqual(
      [
        ["api.daily_total.upsert", undefined, true],
        ["summary.calculate", "api.daily_total.upsert", true],
      ],
    );
    expect(log).not.toHaveBeenCalled();
    release.resolve();
    const response = await pending;
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: { code: "INTERNAL_ERROR" },
    });
    expect(write).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
    expect(
      await runApiEffect(
        fixture.services.listHistoryByDate(period.id, period.startDate),
      ),
    ).toHaveLength(1);
    expect(spans.every((span) => !span.pending)).toBe(true);
    expect(log.mock.calls).toEqual([
      [
        expect.objectContaining({
          operation: "day.add",
          outcome: "unexpected_error",
          error_code: "INTERNAL_ERROR",
          status: 500,
        }),
      ],
    ]);
  });

  it("nests proposal and confirmation work under stable update parents and rejects replay", async () => {
    const { tracing, spans, context } = recordingTracing();
    const fixture = createFixture(NOW, undefined, tracing);
    await seedLinkedPeriods(fixture);
    const writeContexts: (string | undefined)[] = [];
    const updateLinkedBoundary =
      fixture.services.budgetPeriodRepository.updateLinkedBoundary;
    const write = vi
      .spyOn(fixture.services.budgetPeriodRepository, "updateLinkedBoundary")
      .mockImplementation((input) =>
        updateLinkedBoundary(input).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              writeContexts.push(context.getStore());
            }),
          ),
        ),
      );
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const proposalResponse = await put(fixture, UPDATE_REQUEST);
    expect(proposalResponse.status).toBe(409);
    const body: PreviewBody = await proposalResponse.json();
    expect(write).not.toHaveBeenCalled();
    expect(spans.map((span) => [span.name, span.parent])).toEqual([
      ["api.budget_period.update", undefined],
      ["api.budget_period.linked_boundary.propose", "api.budget_period.update"],
    ]);
    expect(log.mock.calls).toEqual([
      [
        expect.objectContaining({
          operation: "period.boundary.propose",
          status: 409,
        }),
      ],
    ]);
    spans.length = 0;
    log.mockClear();
    const confirmation = { ...UPDATE_REQUEST, confirmation: body.proposal };
    expect((await put(fixture, confirmation)).status).toBe(200);
    expect(write).toHaveBeenCalledOnce();
    expect(writeContexts).toEqual([
      "api.budget_period.linked_boundary.confirm",
    ]);
    expect(spans.map((span) => [span.name, span.parent])).toEqual([
      ["api.budget_period.update", undefined],
      ["api.budget_period.linked_boundary.confirm", "api.budget_period.update"],
      ["summary.calculate", "api.budget_period.update"],
    ]);
    expect(spans.map((span) => span.attributes)).toEqual([
      {
        "app.operation": "api.budget_period.update",
        "app.route": "/api/periods/[periodId]",
      },
      {
        "app.operation": "api.budget_period.linked_boundary.confirm",
        "app.route": "/api/periods/[periodId]",
      },
      { "app.operation": "summary.calculate" },
    ]);
    expect(log.mock.calls).toEqual([
      [
        expect.objectContaining({
          operation: "period.boundary.confirm",
          status: 200,
        }),
      ],
    ]);
    spans.length = 0;
    const stale = await put(fixture, confirmation);
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({
      error: { code: "PERIOD_UPDATE_CONFLICT" },
    });
    expect(write).toHaveBeenCalledOnce();
    expect(spans.map((span) => [span.name, span.parent])).toEqual([
      ["api.budget_period.update", undefined],
      ["api.budget_period.linked_boundary.confirm", "api.budget_period.update"],
    ]);
  });

  it("wires public D1 mutation, GET and page invocation spans", async () => {
    vi.stubEnv("YOSAN_FLOW_FORCE_IN_MEMORY_DEV", undefined);
    const { native, spans } = recordingTracing();
    const platform = {
      env: { DB: createPeriodAwareD1Fake() },
      cf: {},
      ctx: { waitUntil() {}, tracing: native },
    } satisfies App.Platform;
    vi.spyOn(console, "log").mockImplementation(() => {});
    expect((await POST(event("POST", period, platform))).status).toBe(201);
    expect(spans[0]?.name).toBe("api.budget_period.create");
    spans.length = 0;
    const summary = await GET(event("GET", undefined, platform));
    expect(summary.status).toBe(200);
    expect(await summary.json()).toMatchObject({
      periodId: period.id,
      budgetYen: period.budgetYen,
    });
    expect(spans).toEqual([
      {
        name: "summary.calculate",
        parent: undefined,
        pending: false,
        attributes: { "app.operation": "summary.calculate" },
      },
    ]);
    spans.length = 0;
    const page = await load({
      ...event("GET", undefined, platform),
      route: { id: "/" },
      parent: async () => ({}),
      depends() {},
      untrack: (fn) => fn(),
    });
    expect(page).toMatchObject({
      selectedPeriodId: period.id,
      summary: { periodId: period.id },
    });
    expect(spans).toEqual([
      {
        name: "summary.calculate",
        parent: undefined,
        pending: false,
        attributes: { "app.operation": "summary.calculate" },
      },
    ]);
  });
});
