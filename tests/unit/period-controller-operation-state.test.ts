import { Effect } from "effect";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as clientEffect from "$lib/dashboard/client-effect";
import type { PeriodSummary } from "$lib/dashboard/controller-types";
import { createPeriodControllerState } from "$lib/dashboard/period-controller-state.svelte";
import {
  createSummary,
  jsonResponse,
} from "./day-entry-controller-test-fixtures";

const period = {
  id: "p-2026-09-01",
  startDate: "2026-09-01",
  endDate: "2026-09-30",
  budgetYen: 120_000,
  status: "active" as const,
  predecessorPeriodId: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};
const periodUrl = `/api/periods/${period.id}`;
const committedRange = {
  startDate: period.startDate,
  endDate: period.endDate,
};
const changedRange = {
  startDate: "2026-09-02",
  endDate: "2026-09-29",
};
const executions: Promise<void>[] = [];

beforeEach(() => {
  vi.spyOn(clientEffect, "runClientEffect").mockImplementation((effect) => {
    executions.push(Effect.runPromise(effect));
  });
});

afterEach(async () => {
  try {
    await Promise.all(executions);
  } finally {
    executions.length = 0;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

function createController() {
  const summary = {
    ...createSummary(0),
    ...committedRange,
    periodId: period.id,
    budgetYen: period.budgetYen,
    periodLengthDays: 30,
    remainingYen: period.budgetYen,
    remainingAfterDayYenPreview: period.budgetYen,
    daysRemaining: 30,
    todayRecommendedYen: 4_000,
    foodPace: {
      ...createSummary(0).foodPace,
      baseDailyYen: 4_000,
      todayAllowanceYen: 4_000,
      todayRemainingYen: 4_000,
    },
    dailyRows: Array.from({ length: 30 }, (_, index) => ({
      date: `2026-09-${String(index + 1).padStart(2, "0")}`,
      label: index === 0 ? ("today" as const) : ("planned" as const),
      usedYen: 0,
      recommendedYen: 4_000,
    })),
  };
  const controller = createPeriodControllerState({
    today: period.startDate,
    periods: [period],
    selectedPeriodId: period.id,
    summary,
  });
  return { controller, summary };
}

function captureUpdates(summary: PeriodSummary, failRange = false) {
  const updatedSummary = { ...summary, budgetYen: 130_000 };
  const requests: Array<{ url: string; method: string; body: unknown }> = [];
  const starts = [Promise.withResolvers<void>(), Promise.withResolvers<void>()];
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method === "PUT" && url === periodUrl) {
      requests.push({ url, method, body: JSON.parse(String(init?.body)) });
      starts[requests.length - 1].resolve();
      return Promise.resolve(
        failRange && requests.length === 1
          ? jsonResponse({ error: { message: "range-save-failure" } }, 500)
          : jsonResponse(updatedSummary),
      );
    }
    if (method === "GET" && (url === "/api/periods" || url === periodUrl)) {
      // Failed reconciliation leaves the failed range draft available for retry.
      if (failRange && requests.length === 1) {
        return Promise.resolve(jsonResponse({ error: {} }, 503));
      }
      return Promise.resolve(
        jsonResponse(
          url === "/api/periods"
            ? { periods: [{ ...period, budgetYen: 130_000 }] }
            : updatedSummary,
        ),
      );
    }
    throw new Error(`Unexpected fetch: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { requests, starts, fetchMock };
}

it("budget uses committed range", async () => {
  const { controller, summary } = createController();
  const { requests, starts } = captureUpdates(summary);

  controller.handleSavePeriod({ budgetYen: 130_000 });
  await starts[0].promise;
  expect(executions).toHaveLength(1);
  await executions[0];

  expect(requests).toEqual([
    {
      url: periodUrl,
      method: "PUT",
      body: { budgetYen: 130_000, ...committedRange },
    },
  ]);
  expect(controller.summary).toMatchObject({
    budgetYen: 130_000,
    ...committedRange,
  });
});

it("failed range does not enter budget payload", async () => {
  const { controller, summary } = createController();
  const { requests, starts, fetchMock } = captureUpdates(summary, true);

  controller.handleRangeChange(changedRange);
  await starts[0].promise;
  expect(executions).toHaveLength(1);
  await executions[0];

  expect(controller.periodSaving).toBe(false);
  expect(controller.periodError).toBe("range-save-failure");
  expect(controller.rangeStartDate).toBe(changedRange.startDate);
  expect(controller.rangeEndDate).toBe(changedRange.endDate);
  expect(controller.summary).toMatchObject(committedRange);
  expect(
    fetchMock.mock.calls.map(([url, init]) => [url, init?.method ?? "GET"]),
  ).toEqual([
    [periodUrl, "PUT"],
    ["/api/periods", "GET"],
    [periodUrl, "GET"],
  ]);

  controller.handleSavePeriod({ budgetYen: 130_000 });
  await starts[1].promise;
  expect(executions).toHaveLength(2);
  await executions[1];

  expect(requests).toEqual([
    {
      url: periodUrl,
      method: "PUT",
      body: { budgetYen: 120_000, ...changedRange },
    },
    {
      url: periodUrl,
      method: "PUT",
      body: { budgetYen: 130_000, ...committedRange },
    },
  ]);
});
