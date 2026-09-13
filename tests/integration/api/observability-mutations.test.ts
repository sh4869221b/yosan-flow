import { afterEach, describe, expect, it, vi } from "vitest";
import { Effect } from "effect";
import { runApiEffect } from "$lib/server/effect/runtime";
import { ApiRouteError } from "$lib/server/validation/month";
import { POST } from "../../../src/routes/api/periods/+server";
import { createPeriodAwareD1Fake } from "../helpers/period-d1-fake";
import { createFixture } from "./periods-fixture";
import { createRouteEvent } from "./route-event-fixture";
import {
  NOW,
  SUCCESSOR_ID,
  UPDATE_REQUEST,
  put,
  putRaw,
  seedLinkedPeriods,
  type PreviewBody,
} from "./period-boundary-update-fixture";

const period = {
  id: "private-period",
  startDate: "2026-04-20",
  endDate: "2026-05-19",
  budgetYen: 100000,
};
const dayPath = "/api/periods/private-period/days/2026-04-20";
const dayRoute = "/api/periods/[periodId]/days/[date]";

function event(
  method: string,
  path: string,
  body?: unknown,
  platform?: App.Platform,
) {
  return createRouteEvent({
    params: {
      periodId: period.id,
      date: period.startDate,
      historyId: "private-history",
    },
    platform,
    request: new Request(`http://localhost${path}?private-query=secret`, {
      method,
      headers: {
        "content-type": "application/json",
        authorization: "Bearer private-auth",
        cookie: "private-cookie",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  });
}

function captureLogs() {
  return vi.spyOn(console, "log").mockImplementation(() => {});
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("mutation terminal events", () => {
  it("logs each mutation once while retaining create, summary and history responses", async () => {
    const fixture = createFixture(undefined, () => "private-history");
    const log = captureLogs();
    const created = await fixture.createPeriod(
      event("POST", "/api/periods", period),
    );
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject(period);
    expect(log.mock.calls).toEqual([
      [
        {
          event: "operation.completed",
          operation: "period.create",
          route: "/api/periods",
          method: "POST",
          outcome: "success",
          status: 201,
        },
      ],
    ]);

    log.mockClear();
    const updated = await fixture.updatePeriod(
      event("PUT", "/api/periods/private-period", {
        ...period,
        budgetYen: 120000,
      }),
    );
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({
      periodId: period.id,
      budgetYen: 120000,
    });
    expect(log.mock.calls).toEqual([
      [
        {
          event: "operation.completed",
          operation: "period.update",
          route: "/api/periods/[periodId]",
          method: "PUT",
          outcome: "success",
          status: 200,
        },
      ],
    ]);

    log.mockClear();
    const added = await fixture.addDay(
      event("POST", `${dayPath}/add`, { inputYen: 1200, memo: "private-memo" }),
    );
    expect(added.status).toBe(200);
    expect(await added.json()).toMatchObject({
      periodId: period.id,
      plannedTotalYen: 1200,
    });
    expect(log.mock.calls).toEqual([
      [
        {
          event: "operation.completed",
          operation: "day.add",
          route: `${dayRoute}/add`,
          method: "POST",
          outcome: "success",
          status: 200,
        },
      ],
    ]);

    log.mockClear();
    const edited = await fixture.mutateHistory.PATCH(
      event("PATCH", `${dayPath}/history/private-history`, {
        inputYen: 800,
        memo: "private-edited-memo",
      }),
    );
    expect(edited.status).toBe(200);
    expect(await edited.json()).toMatchObject({
      summary: { plannedTotalYen: 800 },
      histories: [{ id: "private-history", inputYen: 800 }],
    });
    expect(log.mock.calls).toEqual([
      [
        {
          event: "operation.completed",
          operation: "history.update",
          route: `${dayRoute}/history/[historyId]`,
          method: "PATCH",
          outcome: "success",
          status: 200,
        },
      ],
    ]);

    log.mockClear();
    const removed = await fixture.mutateHistory.DELETE(
      event("DELETE", `${dayPath}/history/private-history`),
    );
    expect(removed.status).toBe(200);
    expect(await removed.json()).toMatchObject({
      summary: { plannedTotalYen: 0 },
      histories: [],
    });
    expect(log.mock.calls).toEqual([
      [
        {
          event: "operation.completed",
          operation: "history.delete",
          route: `${dayRoute}/history/[historyId]`,
          method: "DELETE",
          outcome: "success",
          status: 200,
        },
      ],
    ]);

    log.mockClear();
    const overwritten = await fixture.overwriteDay(
      event("PUT", `${dayPath}/overwrite`, { inputYen: 600 }),
    );
    expect(overwritten.status).toBe(200);
    expect(await overwritten.json()).toMatchObject({ plannedTotalYen: 600 });
    expect(log.mock.calls).toEqual([
      [
        {
          event: "operation.completed",
          operation: "day.overwrite",
          route: `${dayRoute}/overwrite`,
          method: "PUT",
          outcome: "success",
          status: 200,
        },
      ],
    ]);

    log.mockClear();
    expect(
      (await fixture.getPeriod(event("GET", "/api/periods/private-period")))
        .status,
    ).toBe(200);
    expect(log).not.toHaveBeenCalled();
  });

  it("distinguishes malformed input, missing resources and HTTP400 overlap", async () => {
    const fixture = createFixture();
    await runApiEffect(fixture.services.createPeriod(period));
    const log = captureLogs();
    const invalid = await fixture.addDay(
      event("POST", `${dayPath}/add`, { inputYen: -1 }),
    );
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({
      error: { code: "INVALID_AMOUNT" },
    });
    expect(log.mock.calls).toEqual([
      [
        {
          event: "operation.completed",
          operation: "day.add",
          route: `${dayRoute}/add`,
          method: "POST",
          outcome: "validation",
          error_code: "INVALID_AMOUNT",
          status: 400,
        },
      ],
    ]);

    log.mockClear();
    const missing = await fixture.mutateHistory.DELETE(
      event("DELETE", `${dayPath}/history/private-history`),
    );
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({
      error: { code: "HISTORY_NOT_FOUND" },
    });
    expect(log.mock.calls).toEqual([
      [
        {
          event: "operation.completed",
          operation: "history.delete",
          route: `${dayRoute}/history/[historyId]`,
          method: "DELETE",
          outcome: "validation",
          error_code: "HISTORY_NOT_FOUND",
          status: 404,
        },
      ],
    ]);

    log.mockClear();
    const overlap = await fixture.createPeriod(
      event("POST", "/api/periods", { ...period, id: "other-private-period" }),
    );
    expect(overlap.status).toBe(400);
    expect(await overlap.json()).toMatchObject({
      error: { code: "PERIOD_OVERLAP" },
    });
    expect(log.mock.calls).toEqual([
      [
        {
          event: "operation.completed",
          operation: "period.create",
          route: "/api/periods",
          method: "POST",
          outcome: "conflict",
          error_code: "PERIOD_OVERLAP",
          status: 400,
        },
      ],
    ]);
  });

  it("keeps malformed JSON and invalid confirmation on the initial update operation", async () => {
    const fixture = createFixture(NOW);
    const log = captureLogs();
    for (const body of [
      "{private-invalid",
      JSON.stringify({ ...UPDATE_REQUEST, confirmation: {} }),
    ]) {
      log.mockClear();
      const response = await putRaw(fixture, body);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: {
          code: "INVALID_BODY",
          message: "リクエスト JSON が不正です。",
        },
      });
      expect(log.mock.calls).toEqual([
        [
          {
            event: "operation.completed",
            operation: "period.update",
            route: "/api/periods/[periodId]",
            method: "PUT",
            outcome: "validation",
            error_code: "INVALID_BODY",
            status: 400,
          },
        ],
      ]);
    }
  });

  it("records proposal, stale conflict and successful confirmation as separate attempts", async () => {
    const fixture = createFixture(NOW);
    await seedLinkedPeriods(fixture);
    const log = captureLogs();
    const response = await put(fixture, UPDATE_REQUEST);
    expect(response.status).toBe(409);
    const preview: PreviewBody = await response.json();
    expect(preview.error).toEqual({
      code: "PERIOD_BOUNDARY_CONFIRMATION_REQUIRED",
      message: "この変更には後続期間の確認が必要です。",
    });
    expect(log.mock.calls).toEqual([
      [
        {
          event: "operation.completed",
          operation: "period.boundary.propose",
          route: "/api/periods/[periodId]",
          method: "PUT",
          outcome: "conflict",
          error_code: "PERIOD_BOUNDARY_CONFIRMATION_REQUIRED",
          status: 409,
        },
      ],
    ]);

    await runApiEffect(
      fixture.services.updatePeriod(SUCCESSOR_ID, {
        startDate: "2026-07-21",
        endDate: "2026-08-19",
        budgetYen: 81000,
      }),
    );
    log.mockClear();
    const stale = await put(fixture, {
      ...UPDATE_REQUEST,
      confirmation: preview.proposal,
    });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({
      error: { code: "PERIOD_UPDATE_CONFLICT" },
    });
    expect(log.mock.calls).toEqual([
      [
        {
          event: "operation.completed",
          operation: "period.boundary.confirm",
          route: "/api/periods/[periodId]",
          method: "PUT",
          outcome: "conflict",
          error_code: "PERIOD_UPDATE_CONFLICT",
          status: 409,
        },
      ],
    ]);

    const fresh: PreviewBody = await (
      await put(fixture, UPDATE_REQUEST)
    ).json();
    log.mockClear();
    const confirmed = await put(fixture, {
      ...UPDATE_REQUEST,
      confirmation: fresh.proposal,
    });
    expect(confirmed.status).toBe(200);
    expect(await confirmed.json()).toMatchObject({
      endDate: UPDATE_REQUEST.endDate,
      budgetYen: UPDATE_REQUEST.budgetYen,
    });
    expect(log.mock.calls).toEqual([
      [
        {
          event: "operation.completed",
          operation: "period.boundary.confirm",
          route: "/api/periods/[periodId]",
          method: "PUT",
          outcome: "success",
          status: 200,
        },
      ],
    ]);
  });

  it("preserves mapped error responses while excluding raw errors and unregistered codes", async () => {
    const fixture = createFixture();
    const log = captureLogs();
    const create = vi.spyOn(fixture.services, "createPeriod");
    create.mockReturnValueOnce(
      Effect.fail(new Error("private stack and SQL bind 1234")),
    );
    const unknown = await fixture.createPeriod(
      event("POST", "/api/periods", period),
    );
    expect(unknown.status).toBe(500);
    expect(await unknown.json()).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "サーバーエラーが発生しました。",
      },
    });
    expect(log.mock.calls).toEqual([
      [
        {
          event: "operation.completed",
          operation: "period.create",
          route: "/api/periods",
          method: "POST",
          outcome: "unexpected_error",
          error_code: "INTERNAL_ERROR",
          status: 500,
        },
      ],
    ]);

    log.mockClear();
    create.mockReturnValueOnce(
      Effect.fail(new ApiRouteError(400, "private-code", "private message")),
    );
    const explicit = await fixture.createPeriod(
      event("POST", "/api/periods", period),
    );
    expect(explicit.status).toBe(400);
    expect(await explicit.json()).toEqual({
      error: { code: "private-code", message: "private message" },
    });
    expect(log.mock.calls).toEqual([
      [
        {
          event: "operation.completed",
          operation: "period.create",
          route: "/api/periods",
          method: "POST",
          outcome: "validation",
          error_code: "UNKNOWN_ERROR",
          status: 400,
        },
      ],
    ]);
  });

  it("logs only failure when a successful write is followed by a failed summary read", async () => {
    const fixture = createFixture();
    await runApiEffect(fixture.services.createPeriod(period));
    const write = vi.spyOn(fixture.services.dayEntryService, "addDailyAmount");
    vi.spyOn(fixture.services, "listDailyTotalsByPeriodId").mockReturnValueOnce(
      Effect.fail(new Error("private read failure")),
    );
    const log = captureLogs();
    const response = await fixture.addDay(
      event("POST", `${dayPath}/add`, { inputYen: 1200 }),
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: { code: "INTERNAL_ERROR" },
    });
    expect(write).toHaveBeenCalledTimes(1);
    expect(
      await runApiEffect(fixture.services.listDailyTotalsByPeriodId(period.id)),
    ).toMatchObject([{ totalUsedYen: 1200 }]);
    expect(log.mock.calls).toEqual([
      [
        {
          event: "operation.completed",
          operation: "day.add",
          route: `${dayRoute}/add`,
          method: "POST",
          outcome: "unexpected_error",
          error_code: "INTERNAL_ERROR",
          status: 500,
        },
      ],
    ]);
  });

  it("emits once through the public D1 path on success and mapped failure", async () => {
    vi.stubEnv("YOSAN_FLOW_FORCE_IN_MEMORY_DEV", undefined);
    const platform = {
      env: { DB: createPeriodAwareD1Fake() },
      cf: {},
      ctx: { waitUntil: () => {} },
    } satisfies App.Platform;
    const log = captureLogs();
    const response = await POST(
      event("POST", "/api/periods", period, platform),
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject(period);
    expect(log.mock.calls).toEqual([
      [
        {
          event: "operation.completed",
          operation: "period.create",
          route: "/api/periods",
          method: "POST",
          outcome: "success",
          status: 201,
        },
      ],
    ]);
    log.mockClear();
    const invalid = await POST(
      event("POST", "/api/periods", { ...period, budgetYen: -1 }, platform),
    );
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({
      error: { code: "INVALID_AMOUNT" },
    });
    expect(log.mock.calls).toEqual([
      [
        {
          event: "operation.completed",
          operation: "period.create",
          route: "/api/periods",
          method: "POST",
          outcome: "validation",
          error_code: "INVALID_AMOUNT",
          status: 400,
        },
      ],
    ]);
  });

  it("logs public initialization failure and preserves the rejected request", async () => {
    vi.stubEnv("YOSAN_FLOW_FORCE_IN_MEMORY_DEV", undefined);
    const platform = {
      env: { DB: createPeriodAwareD1Fake() },
      cf: {},
      ctx: { waitUntil: () => {} },
    } satisfies App.Platform;
    Reflect.deleteProperty(platform.env, "DB");
    const log = captureLogs();
    await expect(
      POST(event("POST", "/api/periods", period, platform)),
    ).rejects.toThrow("D1 binding DB is required");
    expect(log.mock.calls).toEqual([
      [
        {
          event: "operation.completed",
          operation: "period.create",
          route: "/api/periods",
          method: "POST",
          outcome: "unexpected_error",
          error_code: "INTERNAL_ERROR",
          status: 500,
        },
      ],
    ]);
  });
});
