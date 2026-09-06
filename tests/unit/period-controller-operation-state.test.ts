import { Effect } from "effect";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as clientEffect from "$lib/dashboard/client-effect";
import type { PeriodSummary } from "$lib/dashboard/controller-types";
import { createPeriodControllerState } from "$lib/dashboard/period-controller-state.svelte";
import { createPeriodSummaryRevision } from "$lib/dashboard/period-summary-revision";
import { createDashboardPageController } from "$lib/dashboard/page-controller.svelte";
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

function createController(onPeriodChanged = () => {}) {
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
  const data = {
    today: period.startDate,
    periods: [period],
    selectedPeriodId: period.id,
    summary,
  };
  const revision = createPeriodSummaryRevision();
  const controller = createPeriodControllerState(
    data,
    revision,
    onPeriodChanged,
  );
  return { controller, summary, revision, data };
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

it("independent reset and accepted summary", async () => {
  const { controller, summary } = createController();
  const started = Promise.withResolvers<void>();
  const spendingSummary = { ...summary, spentToDateYen: 1_000 };
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (method === "PUT" && url === periodUrl) {
        started.resolve();
        return Promise.resolve(
          jsonResponse({ error: { message: "range-save-failure" } }, 500),
        );
      }
      if (method === "GET" && url === "/api/periods") {
        return Promise.resolve(jsonResponse({ periods: [period] }));
      }
      if (method === "GET" && url === periodUrl) {
        return Promise.resolve(jsonResponse(spendingSummary));
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    }),
  );

  controller.budget.draft = "130000";
  controller.handleRangeChange(changedRange);
  await started.promise;
  expect(executions).toHaveLength(1);
  await executions[0];

  expect(controller.summary).toEqual(spendingSummary);
  expect(controller.rangeStartDate).toBe(changedRange.startDate);
  expect(controller.rangeEndDate).toBe(changedRange.endDate);
  expect(controller.budget.draft).toBe("130000");
  expect(controller.budget.dirty).toBe(true);
  expect(controller.range.dirty).toBe(true);

  controller.setSummary({ ...spendingSummary, spentToDateYen: 2_000 });
  expect(controller.budget.draft).toBe("130000");
  expect(controller.range.draft).toEqual(changedRange);
  expect(controller.budget.settingChanged).toBe(false);
  expect(controller.range.settingChanged).toBe(false);
  controller.budget.reset();
  expect(controller.budget.draft).toBe("120000");
  expect(controller.budget.dirty).toBe(false);
  expect(controller.range.draft).toEqual(changedRange);
  controller.budget.draft = "130000";
  controller.range.reset();
  expect(controller.range.draft).toEqual(committedRange);
  expect(controller.range.dirty).toBe(false);
  expect(controller.budget.draft).toBe("130000");
});

it("external setting change requires reset", async () => {
  const { controller, summary, revision } = createController();
  const external = { ...summary, budgetYen: 140_000 };
  const { requests, starts } = captureUpdates(external);
  controller.budget.draft = "130000";
  controller.range.edit(changedRange);

  revision.publish(external, controller.setSummary);
  expect(revision.get(period.id)).toBe(1);
  expect(controller.summary?.budgetYen).toBe(140_000);
  expect(controller.budget.draft).toBe("130000");
  expect(controller.budget.settingChanged).toBe(true);
  expect(controller.range.settingChanged).toBe(false);
  controller.saveBudget();
  controller.budget.draft = "140000";
  expect(controller.budget.dirty).toBe(false);
  controller.saveBudget();
  controller.handleSavePeriod({ budgetYen: 130_000 });
  expect(executions).toHaveLength(0);
  expect(requests).toEqual([]);
  expect(controller.budget.settingChanged).toBe(true);

  controller.budget.reset();
  expect(controller.budget.draft).toBe("140000");
  expect(controller.budget.settingChanged).toBe(false);
  expect(controller.range.draft).toEqual(changedRange);
  controller.budget.draft = "130000";
  controller.saveBudget();
  await starts[0].promise;
  await executions[0];
  expect(requests).toEqual([
    {
      url: periodUrl,
      method: "PUT",
      body: { budgetYen: 130_000, ...committedRange },
    },
  ]);
  expect(controller.budget.success).toBe(true);
  expect(controller.budget.dirty).toBe(false);
  expect(controller.range.draft).toEqual(changedRange);
});

it.each(["", "1e3", "10.5", "-1"])(
  "retains invalid raw budget %j without a PUT",
  (raw) => {
    const { controller, summary } = createController();
    const { fetchMock } = captureUpdates(summary);
    controller.range.edit(changedRange);
    controller.budget.draft = raw;
    controller.saveBudget();
    expect(controller.budget.draft).toBe(raw);
    expect(controller.budget.dirty).toBe(true);
    expect(controller.budget.validationError).not.toBeNull();
    expect(controller.range.draft).toEqual(changedRange);
    expect(controller.range.validationErrors).toEqual({
      startDate: null,
      endDate: null,
      range: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(executions).toHaveLength(0);
    controller.budget.draft = " 0120000 ";
    expect(controller.budget.validationError).toBeNull();
    expect(controller.budget.dirty).toBe(false);
  },
);

it.each([
  { startDate: "", endDate: "2026-09-29", errors: ["startDate"] },
  { startDate: "2026-09-31", endDate: "2026-09-29", errors: ["startDate"] },
  { startDate: "2026-09-02", endDate: "", errors: ["endDate"] },
  { startDate: "2026-09-02", endDate: "2026-02-30", errors: ["endDate"] },
  { startDate: "2026-09-29", endDate: "2026-09-02", errors: ["range"] },
  { startDate: "", endDate: "invalid", errors: ["startDate", "endDate"] },
])(
  "retains invalid raw range $startDate..$endDate without a PUT",
  ({ startDate, endDate, errors }) => {
    const { controller, summary } = createController();
    const { fetchMock } = captureUpdates(summary);
    controller.budget.draft = "130000";
    const raw = { startDate, endDate };
    controller.range.edit(raw);
    controller.saveRange();
    expect(controller.range.draft).toEqual(raw);
    expect(controller.range.dirty).toBe(true);
    expect(
      Object.entries(controller.range.validationErrors)
        .filter(([, value]) => value != null)
        .map(([key]) => key),
    ).toEqual(errors);
    expect(controller.budget.draft).toBe("130000");
    expect(controller.budget.validationError).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(executions).toHaveLength(0);
    controller.setSummary({ ...summary, spentToDateYen: 1_000 });
    expect(controller.range.draft).toEqual(raw);
    expect(
      Object.entries(controller.range.validationErrors)
        .filter(([, value]) => value != null)
        .map(([key]) => key),
    ).toEqual(errors);
    controller.range.edit(changedRange);
    expect(controller.range.validationErrors).toEqual({
      startDate: null,
      endDate: null,
      range: null,
    });
  },
);

it("resets only its own validation while keeping invalid counterpart raw", () => {
  const { controller, summary } = createController();
  const { fetchMock } = captureUpdates(summary);
  controller.budget.draft = "1e3";
  controller.range.edit({ startDate: "", endDate: "2026-09-29" });
  controller.saveBudget();
  controller.saveRange();
  controller.setSummary({ ...summary, spentToDateYen: 1_000 });
  expect(controller.budget.draft).toBe("1e3");
  expect(controller.budget.validationError).not.toBeNull();
  controller.range.reset();
  expect(controller.range.validationErrors.startDate).toBeNull();
  expect(controller.budget.validationError).not.toBeNull();
  controller.range.edit({ startDate: "", endDate: "invalid" });
  controller.saveRange();
  controller.budget.reset();
  expect(controller.budget.validationError).toBeNull();
  expect(controller.range.validationErrors.startDate).not.toBeNull();
  expect(controller.range.validationErrors.endDate).not.toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});

it("syncs clean settings independently and keeps stale dirty settings sticky", () => {
  const { controller, summary } = createController();
  controller.range.edit(changedRange);
  controller.setSummary({ ...summary, budgetYen: 140_000 });
  expect(controller.budget.draft).toBe("140000");
  expect(controller.budget.settingChanged).toBe(false);
  expect(controller.range.draft).toEqual(changedRange);
  controller.range.reset();
  controller.budget.draft = "130000";
  controller.setSummary({
    ...summary,
    budgetYen: 140_000,
    startDate: "2026-09-03",
    endDate: "2026-09-28",
  });
  expect(controller.budget.draft).toBe("130000");
  expect(controller.budget.settingChanged).toBe(false);
  expect(controller.range.draft).toEqual({
    startDate: "2026-09-03",
    endDate: "2026-09-28",
  });
  expect(controller.range.settingChanged).toBe(false);

  controller.range.edit(changedRange);
  controller.setSummary({
    ...summary,
    budgetYen: 120_000,
    startDate: "2026-09-04",
    endDate: "2026-09-27",
  });
  expect(controller.budget.settingChanged).toBe(true);
  expect(controller.range.settingChanged).toBe(true);
  expect(controller.budget.draft).toBe("130000");
  expect(controller.range.draft).toEqual(changedRange);
  const { fetchMock } = captureUpdates(summary);
  controller.range.edit({ startDate: "2026-09-04", endDate: "2026-09-27" });
  expect(controller.range.dirty).toBe(false);
  controller.saveRange();
  controller.handleRangeChange(changedRange);
  expect(executions).toHaveLength(0);
  expect(fetchMock).not.toHaveBeenCalled();
  controller.range.reset();
  expect(controller.range.draft).toEqual({
    startDate: "2026-09-04",
    endDate: "2026-09-27",
  });
  expect(controller.range.settingChanged).toBe(false);
  expect(controller.budget.settingChanged).toBe(true);
});

it("preserves failed selection drafts and resets only on accepted different period", async () => {
  const onPeriodChanged = vi.fn();
  const { controller, summary, revision } = createController(onPeriodChanged);
  const otherSummary = {
    ...summary,
    periodId: "p-2026-10-01",
    budgetYen: 140_000,
    startDate: "2026-10-01",
    endDate: "2026-10-31",
  };
  const response = Promise.withResolvers<Response>();
  const started = Promise.withResolvers<void>();
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    expect([String(input), init?.method ?? "GET"]).toEqual([
      "/api/periods/p-2026-10-01",
      "GET",
    ]);
    started.resolve();
    return response.promise;
  });
  vi.stubGlobal("fetch", fetchMock);
  controller.budget.draft = "130000";
  controller.range.edit(changedRange);
  controller.createBudgetInput = "777";
  controller.handleSelectPeriod({ periodId: otherSummary.periodId });
  await started.promise;
  response.resolve(jsonResponse({ error: {} }, 503));
  await executions[0];
  expect(controller.selectedPeriodId).toBe(period.id);
  expect(controller.summaryError).not.toBeNull();
  expect(controller.budget.draft).toBe("130000");
  expect(controller.range.draft).toEqual(changedRange);
  expect(onPeriodChanged).not.toHaveBeenCalled();

  fetchMock.mockResolvedValue(jsonResponse(otherSummary));
  controller.handleSelectPeriod({ periodId: otherSummary.periodId });
  expect(executions).toHaveLength(2);
  await executions[1];
  expect(controller.selectedPeriodId).toBe(otherSummary.periodId);
  expect(controller.budget.draft).toBe("140000");
  expect(controller.range.draft).toEqual({
    startDate: "2026-10-01",
    endDate: "2026-10-31",
  });
  expect(controller.budget.dirty).toBe(false);
  expect(controller.range.dirty).toBe(false);
  expect(controller.budget.settingChanged).toBe(false);
  expect(controller.range.settingChanged).toBe(false);
  expect(controller.createBudgetInput).toBe("777");
  expect(onPeriodChanged).toHaveBeenCalledOnce();
  expect(revision.get(otherSummary.periodId)).toBe(1);
});

it("rejects a stale selection summary without adopting its settings", async () => {
  const { controller, summary, revision } = createController();
  const started = Promise.withResolvers<void>();
  const response = Promise.withResolvers<Response>();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      started.resolve();
      return response.promise;
    }),
  );
  controller.budget.draft = "130000";
  controller.range.edit(changedRange);
  controller.handleSelectPeriod({ periodId: period.id });
  await started.promise;
  const external = { ...summary, budgetYen: 140_000 };
  revision.publish(external, controller.setSummary);
  response.resolve(jsonResponse(summary));
  await executions[0];
  expect(controller.summary).toEqual(external);
  expect(controller.budget.draft).toBe("130000");
  expect(controller.budget.settingChanged).toBe(true);
  expect(controller.range.draft).toEqual(changedRange);
  expect(revision.get(period.id)).toBe(1);
});

it("empties unavailable drafts through both accepted null summary paths", async () => {
  const { controller, summary } = createController();
  controller.budget.draft = "130000";
  controller.range.edit(changedRange);
  controller.setSummary(null);
  expect(controller.budget.draft).toBe("");
  expect(controller.range.draft).toEqual({ startDate: "", endDate: "" });
  expect(controller.budget.dirty).toBe(false);
  expect(controller.range.dirty).toBe(false);
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  controller.saveBudget();
  controller.saveRange();
  controller.handleSavePeriod({ budgetYen: 130_000 });
  controller.handleRangeChange(changedRange);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(executions).toHaveLength(0);

  controller.setSummary(summary);
  expect(controller.budget.draft).toBe("120000");
  expect(controller.range.draft).toEqual(committedRange);
  const started = Promise.withResolvers<void>();
  fetchMock.mockImplementation(
    (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === periodUrl && init?.method === "PUT") {
        started.resolve();
        return Promise.resolve(jsonResponse({ error: {} }, 500));
      }
      expect(String(input)).toBe("/api/periods");
      return Promise.resolve(jsonResponse({ periods: [] }));
    },
  );
  controller.handleRangeChange(changedRange);
  await started.promise;
  await executions[0];
  expect(controller.summary).toBeNull();
  expect(controller.selectedPeriodId).toBeNull();
  expect(controller.budget.draft).toBe("");
  expect(controller.range.draft).toEqual({ startDate: "", endDate: "" });
  expect(controller.periodUpdateProposal).toBeNull();
});

it("adopts an own range save without erasing the dirty budget", async () => {
  const { controller, summary } = createController();
  const started = Promise.withResolvers<void>();
  const updated = { ...summary, ...changedRange };
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === periodUrl && init?.method === "PUT") {
      started.resolve();
      return Promise.resolve(jsonResponse(updated));
    }
    if (url === "/api/periods")
      return Promise.resolve(
        jsonResponse({ periods: [{ ...period, ...changedRange }] }),
      );
    if (url === periodUrl) return Promise.resolve(jsonResponse(updated));
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  controller.budget.draft = "130000";
  controller.range.edit(changedRange);
  controller.saveRange();
  await started.promise;
  await executions[0];
  expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
    budgetYen: 120_000,
    ...changedRange,
  });
  expect(controller.range.dirty).toBe(false);
  expect(controller.range.settingChanged).toBe(false);
  expect(controller.range.success).toBe(true);
  expect(controller.budget.draft).toBe("130000");
  expect(controller.budget.success).toBe(false);
  controller.setSummary({ ...updated, spentToDateYen: 1_000 });
  expect(controller.range.success).toBe(true);
  controller.budget.reset();
  expect(controller.range.success).toBe(true);
  controller.range.edit(committedRange);
  expect(controller.range.success).toBe(false);
});

it("preserves new raw edits during an own save reconciliation", async () => {
  const { controller, summary } = createController();
  const listStarted = Promise.withResolvers<void>();
  const listResponse = Promise.withResolvers<Response>();
  const updated = { ...summary, budgetYen: 130_000 };
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === periodUrl && init?.method === "PUT")
        return Promise.resolve(jsonResponse(updated));
      if (String(input) === "/api/periods") {
        listStarted.resolve();
        return listResponse.promise;
      }
      if (String(input) === periodUrl)
        return Promise.resolve(jsonResponse(updated));
      throw new Error(`Unexpected fetch: ${String(input)}`);
    }),
  );
  controller.handleSavePeriod({ budgetYen: 130_000 });
  await listStarted.promise;
  controller.budget.draft = "140000";
  listResponse.resolve(
    jsonResponse({ periods: [{ ...period, budgetYen: 130_000 }] }),
  );
  await executions[0];
  expect(controller.summary?.budgetYen).toBe(130_000);
  expect(controller.budget.draft).toBe("140000");
  expect(controller.budget.dirty).toBe(true);
  expect(controller.budget.settingChanged).toBe(false);
});

it("exposes the same raw settings actions through the page facade", async () => {
  const { data, summary } = createController();
  const page = createDashboardPageController(() => data);
  const { starts, requests } = captureUpdates(summary);
  page.budget.draft = "130000";
  page.range.edit(changedRange);
  expect(page.rangeStartDate).toBe(changedRange.startDate);
  expect(page.rangeEndDate).toBe(changedRange.endDate);
  page.saveBudget();
  await starts[0].promise;
  await executions[0];
  expect(page.budget.dirty).toBe(false);
  expect(page.range.draft).toEqual(changedRange);
  expect(requests[0]).toEqual({
    url: periodUrl,
    method: "PUT",
    body: { budgetYen: 130_000, ...committedRange },
  });
});

it("requires a range reset after an accepted same-period settings GET", async () => {
  const { controller, summary, revision } = createController();
  const external = {
    ...summary,
    budgetYen: 140_000,
    startDate: "2026-09-03",
    endDate: "2026-09-28",
  };
  const selected = Promise.withResolvers<void>();
  const submitted = Promise.withResolvers<void>();
  let committed = external;
  const puts: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === periodUrl && init?.method === "PUT") {
        puts.push(JSON.parse(String(init.body)));
        committed = { ...external, ...changedRange };
        submitted.resolve();
        return Promise.resolve(jsonResponse(committed));
      }
      if (url === periodUrl) {
        selected.resolve();
        return Promise.resolve(jsonResponse(committed));
      }
      if (url === "/api/periods")
        return Promise.resolve(
          jsonResponse({ periods: [{ ...period, ...committed }] }),
        );
      throw new Error(`Unexpected fetch: ${url}`);
    }),
  );
  controller.budget.draft = "130000";
  controller.range.edit(changedRange);
  controller.handleSelectPeriod({ periodId: period.id });
  await selected.promise;
  await executions[0];
  expect(revision.get(period.id)).toBe(1);
  expect(controller.budget.draft).toBe("130000");
  expect(controller.budget.settingChanged).toBe(true);
  expect(controller.range.draft).toEqual(changedRange);
  expect(controller.range.settingChanged).toBe(true);
  controller.saveRange();
  controller.range.edit({ startDate: "2026-09-04", endDate: "2026-09-27" });
  controller.saveRange();
  expect(executions).toHaveLength(1);
  expect(puts).toEqual([]);
  controller.range.reset();
  expect(controller.range.draft).toEqual({
    startDate: "2026-09-03",
    endDate: "2026-09-28",
  });
  controller.range.edit(changedRange);
  controller.saveRange();
  await submitted.promise;
  await executions[1];
  expect(puts).toEqual([{ budgetYen: 140_000, ...changedRange }]);
  expect(controller.range.settingChanged).toBe(false);
  expect(controller.range.dirty).toBe(false);
  expect(controller.budget.draft).toBe("130000");
  expect(controller.budget.settingChanged).toBe(true);
});

it("resets invalid and stale drafts on an accepted different-period setSummary", () => {
  const { controller, summary, revision } = createController();
  controller.budget.draft = "1e3";
  controller.range.edit({ startDate: "", endDate: "invalid" });
  controller.saveBudget();
  controller.saveRange();
  controller.setSummary({ ...summary, budgetYen: 140_000, ...changedRange });
  expect(controller.budget.settingChanged).toBe(true);
  expect(controller.range.settingChanged).toBe(true);
  controller.setSummary({
    ...summary,
    periodId: "other",
    budgetYen: 130_000,
    startDate: "2026-10-01",
    endDate: "2026-10-31",
  });
  expect(controller.budget.draft).toBe("130000");
  expect(controller.budget.validationError).toBeNull();
  expect(controller.budget.settingChanged).toBe(false);
  expect(controller.range.draft).toEqual({
    startDate: "2026-10-01",
    endDate: "2026-10-31",
  });
  expect(controller.range.validationErrors).toEqual({
    startDate: null,
    endDate: null,
    range: null,
  });
  expect(controller.range.settingChanged).toBe(false);
  expect(revision.get("other")).toBe(0);
  expect(executions).toHaveLength(0);
});

it("blocks ordinary resets during the existing management save", async () => {
  const { controller, summary } = createController();
  const started = Promise.withResolvers<void>();
  const response = Promise.withResolvers<Response>();
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === periodUrl && init?.method === "PUT") {
        started.resolve();
        return response.promise;
      }
      if (String(input) === "/api/periods")
        return Promise.resolve(jsonResponse({ periods: [period] }));
      if (String(input) === periodUrl)
        return Promise.resolve(jsonResponse(summary));
      throw new Error(`Unexpected fetch: ${String(input)}`);
    }),
  );
  controller.budget.draft = "130000";
  controller.handleRangeChange(changedRange);
  await started.promise;
  controller.budget.reset();
  controller.range.reset();
  response.resolve(jsonResponse({ error: {} }, 500));
  await executions[0];
  expect(controller.budget.draft).toBe("130000");
  expect(controller.range.draft).toEqual(changedRange);
  controller.budget.reset();
  controller.range.reset();
  expect(controller.budget.draft).toBe("120000");
  expect(controller.range.draft).toEqual(committedRange);
});
