import { Effect } from "effect";
import { expect, it, vi } from "vitest";
import {
  captureClientEffects,
  settled,
} from "./period-controller-effect-fixture";
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
const executions = captureClientEffects();

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
  await settled(starts[0].promise);
  expect(executions).toHaveLength(1);
  await settled(executions[0]);

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
  await settled(starts[0].promise);
  expect(executions).toHaveLength(1);
  await settled(executions[0]);

  expect(controller.periodSaving).toBe(false);
  expect(controller.range.serverError).toBe("range-save-failure");
  expect(controller.periodError).toBeNull();
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
  await settled(starts[1].promise);
  expect(executions).toHaveLength(2);
  await settled(executions[1]);

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
  await settled(started.promise);
  expect(executions).toHaveLength(1);
  await settled(executions[0]);

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
  await settled(starts[0].promise);
  await settled(executions[0]);
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
  await settled(started.promise);
  response.resolve(jsonResponse({ error: {} }, 503));
  await settled(executions[0]);
  expect(controller.selectedPeriodId).toBe(period.id);
  expect(controller.summaryError).not.toBeNull();
  expect(controller.budget.draft).toBe("130000");
  expect(controller.range.draft).toEqual(changedRange);
  expect(onPeriodChanged).not.toHaveBeenCalled();

  fetchMock.mockResolvedValue(jsonResponse(otherSummary));
  controller.handleSelectPeriod({ periodId: otherSummary.periodId });
  expect(executions).toHaveLength(2);
  await settled(executions[1]);
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
  await settled(started.promise);
  const external = { ...summary, budgetYen: 140_000 };
  revision.publish(external, controller.setSummary);
  response.resolve(jsonResponse(summary));
  await settled(executions[0]);
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
  await settled(started.promise);
  await settled(executions[0]);
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
  await settled(started.promise);
  await settled(executions[0]);
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
  await settled(listStarted.promise);
  controller.budget.draft = "140000";
  listResponse.resolve(
    jsonResponse({ periods: [{ ...period, budgetYen: 130_000 }] }),
  );
  await settled(executions[0]);
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
  await settled(starts[0].promise);
  await settled(executions[0]);
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
  await settled(selected.promise);
  await settled(executions[0]);
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
  await settled(submitted.promise);
  await settled(executions[1]);
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
  await settled(started.promise);
  controller.budget.reset();
  controller.range.reset();
  response.resolve(jsonResponse({ error: {} }, 500));
  await settled(executions[0]);
  expect(controller.budget.draft).toBe("130000");
  expect(controller.range.draft).toEqual(changedRange);
  controller.budget.reset();
  controller.range.reset();
  expect(controller.budget.draft).toBe("120000");
  expect(controller.range.draft).toEqual(committedRange);
});

it.each(["budget", "range"] as const)(
  "operation saving spans reconciliation (%s)",
  async (operation) => {
    const { controller, summary } = createController();
    const putStarted = Promise.withResolvers<void>();
    const putResponse = Promise.withResolvers<Response>();
    const listStarted = Promise.withResolvers<void>();
    const listResponse = Promise.withResolvers<Response>();
    const summaryStarted = Promise.withResolvers<void>();
    const summaryResponse = Promise.withResolvers<Response>();
    const payload =
      operation === "budget"
        ? { budgetYen: 130_000, ...committedRange }
        : { budgetYen: 120_000, ...changedRange };
    const updated = { ...summary, ...payload };
    const requests: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === periodUrl && init?.method === "PUT") {
          requests.push(JSON.parse(String(init.body)));
          putStarted.resolve();
          return putResponse.promise;
        }
        if (String(input) === "/api/periods") {
          listStarted.resolve();
          return listResponse.promise;
        }
        if (String(input) === periodUrl) {
          summaryStarted.resolve();
          return summaryResponse.promise;
        }
        throw new Error(`Unexpected fetch: ${String(input)}`);
      }),
    );
    controller.budget.draft = "130000";
    controller.range.edit(changedRange);
    if (operation === "budget") controller.saveBudget();
    else controller.saveRange();
    function assertLocked() {
      expect(controller.periodInteractionDisabled).toBe(true);
      expect(controller.budget.saving).toBe(operation === "budget");
      expect(controller.range.saving).toBe(operation === "range");
      expect(controller.periodSaving).toBe(false);
      controller.handleSavePeriod({ budgetYen: 140_000 });
      controller.handleRangeChange({ startDate: "", endDate: "invalid" });
      controller.saveBudget();
      controller.saveRange();
      controller.createInitialPeriod();
      controller.budget.reset();
      controller.range.reset();
      expect(executions).toHaveLength(1);
      expect(controller.budget.draft).toBe("130000");
      expect(controller.range.draft).toEqual(changedRange);
      expect(controller.budget.validationError).toBeNull();
      expect(controller.range.validationErrors).toEqual({
        startDate: null,
        endDate: null,
        range: null,
      });
      expect(controller.periodError).toBeNull();
    }
    try {
      assertLocked();
      await settled(putStarted.promise);
      assertLocked();
      putResponse.resolve(jsonResponse(updated));
      await settled(listStarted.promise);
      assertLocked();
      listResponse.resolve(jsonResponse({ periods: [period] }));
      await settled(summaryStarted.promise);
      assertLocked();
    } finally {
      putResponse.resolve(jsonResponse(updated));
      listResponse.resolve(jsonResponse({ periods: [period] }));
      summaryResponse.resolve(jsonResponse(updated));
      await settled(executions[0]);
    }
    expect(requests).toEqual([payload]);
    expect(controller.periodInteractionDisabled).toBe(false);
    expect(controller.budget.saving).toBe(false);
    expect(controller.range.saving).toBe(false);
    expect(controller[operation].success).toBe(true);
    expect(
      controller[operation === "budget" ? "range" : "budget"].success,
    ).toBe(false);
  },
);

it.each([
  { returnToA: false, failed: false },
  { returnToA: true, failed: false },
  { returnToA: false, failed: true },
  { returnToA: true, failed: true },
])(
  "duplicate and offscreen updates do not publish feedback (return=$returnToA, failed=$failed)",
  async ({ returnToA, failed }) => {
    const { controller, summary } = createController();
    const started = Promise.withResolvers<void>();
    const response = Promise.withResolvers<Response>();
    const other = { ...summary, periodId: "other", budgetYen: 140_000 };
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        requests.push(`${init?.method ?? "GET"} ${url}`);
        if (url === periodUrl && init?.method === "PUT") {
          started.resolve();
          return response.promise;
        }
        if (url === "/api/periods/other")
          return Promise.resolve(jsonResponse(other));
        if (url === periodUrl) return Promise.resolve(jsonResponse(summary));
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );
    controller.handleSavePeriod({ budgetYen: 130_000 });
    try {
      controller.handleSavePeriod({ budgetYen: 140_000 });
      expect(executions).toHaveLength(1);
      expect(controller.budget.draft).toBe("130000");
      await settled(started.promise);
      controller.handleSelectPeriod({ periodId: "other" });
      await settled(executions[1]);
      if (returnToA) {
        controller.handleSelectPeriod({ periodId: period.id });
        await settled(executions[2]);
      }
      controller.budget.draft = "150000";
      controller.range.edit({ startDate: "", endDate: "invalid" });
      expect(controller.periodInteractionDisabled).toBe(true);
      controller.handleSavePeriod({ budgetYen: 160_000 });
      expect(controller.budget.draft).toBe("150000");
    } finally {
      response.resolve(
        failed
          ? jsonResponse({ error: { message: "old-save-failure" } }, 500)
          : jsonResponse({ ...summary, budgetYen: 130_000 }),
      );
      await settled(executions[0]);
    }
    expect(controller.summary).toEqual(returnToA ? summary : other);
    expect(controller.budget.draft).toBe("150000");
    expect(controller.range.draft).toEqual({
      startDate: "",
      endDate: "invalid",
    });
    expect(controller.budget.success).toBe(false);
    expect(controller.budget.serverError).toBeNull();
    expect(controller.periodError).toBeNull();
    expect(controller.periodInteractionDisabled).toBe(false);
    expect(requests.filter((request) => request.startsWith("PUT"))).toEqual([
      `PUT ${periodUrl}`,
    ]);
    expect(requests).not.toContain("GET /api/periods");
  },
);

it.each(["budget", "range"] as const)(
  "isolates %s failure from counterpart success and create feedback",
  async (operation) => {
    const { controller, summary } = createController();
    let puts = 0;
    const counterpart = operation === "budget" ? "range" : "budget";
    const updated = {
      ...summary,
      ...(counterpart === "range" ? changedRange : { budgetYen: 130_000 }),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === periodUrl && init?.method === "PUT") {
          puts += 1;
          return Promise.resolve(
            puts === 1
              ? jsonResponse(
                  { error: { message: `${operation}-failure` } },
                  500,
                )
              : jsonResponse(updated),
          );
        }
        if (String(input) === "/api/periods")
          return Promise.resolve(jsonResponse({ periods: [period] }));
        if (String(input) === periodUrl)
          return Promise.resolve(jsonResponse(puts === 1 ? summary : updated));
        throw new Error(`Unexpected fetch: ${String(input)}`);
      }),
    );
    controller.createBudgetInput = "invalid";
    controller.createInitialPeriod();
    await settled(executions[0]);
    const createError = controller.periodError;
    expect(createError).not.toBeNull();
    controller.budget.draft = "130000";
    controller.range.edit(changedRange);
    if (operation === "budget") controller.saveBudget();
    else controller.saveRange();
    await settled(executions[1]);
    expect(controller[operation].serverError).toBe(`${operation}-failure`);
    expect(controller[operation].success).toBe(false);
    expect(controller[counterpart].serverError).toBeNull();
    if (counterpart === "budget") controller.saveBudget();
    else controller.saveRange();
    await settled(executions[2]);
    expect(controller[counterpart].success).toBe(true);
    expect(controller[operation].serverError).toBe(`${operation}-failure`);
    expect(controller[operation].dirty).toBe(true);
    expect(controller.periodError).toBe(createError);
    controller[operation].reset();
    expect(controller[operation].serverError).toBeNull();
    expect(controller[counterpart].success).toBe(true);
  },
);

it.each(["budget", "range"] as const)(
  "rejects stale %s PUT feedback and reports failed authoritative reconciliation",
  async (operation) => {
    const { controller, summary, revision } = createController();
    const started = Promise.withResolvers<void>();
    const response = Promise.withResolvers<Response>();
    const payload =
      operation === "budget"
        ? { budgetYen: 130_000, ...committedRange }
        : { budgetYen: 120_000, ...changedRange };
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === periodUrl && init?.method === "PUT") {
          started.resolve();
          return response.promise;
        }
        return Promise.resolve(
          jsonResponse({ error: { message: "reconcile-failure" } }, 503),
        );
      }),
    );
    controller.budget.draft = "130000";
    controller.range.edit(changedRange);
    if (operation === "budget") controller.saveBudget();
    else controller.saveRange();
    try {
      await settled(started.promise);
      revision.publish(
        {
          ...summary,
          spentToDateYen: 1_000,
          plannedTotalYen: 1_000,
          dailyRows: summary.dailyRows.map((row, i) =>
            i === 0 ? { ...row, usedYen: 1_000 } : row,
          ),
        },
        controller.setSummary,
      );
    } finally {
      response.resolve(jsonResponse({ ...summary, ...payload }));
      await settled(executions[0]);
    }
    expect(controller[operation].success).toBe(false);
    expect(controller[operation].serverError).toBe("reconcile-failure");
    expect(controller[operation].dirty).toBe(true);
    expect(controller.summary?.spentToDateYen).toBe(1_000);
    expect(controller.budget.draft).toBe("130000");
    expect(controller.range.draft).toEqual(changedRange);
    expect(controller.periodError).toBeNull();
    expect(controller.periodInteractionDisabled).toBe(false);
  },
);

it.each(["POST", "list", "summary"] as const)(
  "reserves duplicate creates through %s failure without recovery",
  async (failure) => {
    const { controller, summary } = createController();
    const started = Promise.withResolvers<void>();
    const response = Promise.withResolvers<Response>();
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input),
          method = init?.method ?? "GET";
        requests.push(`${method} ${url}`);
        if (method === "POST") {
          started.resolve();
          return response.promise;
        }
        if (url === "/api/periods")
          return Promise.resolve(
            failure === "list"
              ? jsonResponse({ error: { message: "list-failure" } }, 503)
              : jsonResponse({ periods: [period] }),
          );
        if (url === periodUrl)
          return Promise.resolve(
            jsonResponse({ error: { message: "summary-failure" } }, 503),
          );
        throw new Error(`Unexpected fetch: ${method} ${url}`);
      }),
    );
    controller.budget.draft = "130000";
    controller.range.edit(changedRange);
    controller.createInitialPeriod();
    try {
      expect(controller.periodSaving).toBe(true);
      expect(controller.budget.saving).toBe(false);
      expect(controller.range.saving).toBe(false);
      controller.createInitialPeriod();
      controller.handleSavePeriod({ budgetYen: 140_000 });
      controller.handleRangeChange(committedRange);
      expect(executions).toHaveLength(1);
      await settled(started.promise);
    } finally {
      response.resolve(
        failure === "POST"
          ? jsonResponse({ error: { message: "create-failure" } }, 500)
          : jsonResponse({ id: period.id }),
      );
      await settled(executions[0]);
    }
    expect(requests).toEqual([
      "POST /api/periods",
      ...(failure === "POST" ? [] : ["GET /api/periods"]),
      ...(failure === "summary" ? [`GET ${periodUrl}`] : []),
    ]);
    expect(controller.summary).toEqual(summary);
    expect(controller.periodSaving).toBe(false);
    expect(controller.periodInteractionDisabled).toBe(false);
    expect(controller.budget.draft).toBe("130000");
    expect(controller.range.draft).toEqual(changedRange);
    expect(controller.budget.serverError).toBeNull();
    expect(controller.range.serverError).toBeNull();
    expect(
      failure === "summary" ? controller.summaryError : controller.periodError,
    ).toBe(`${failure === "POST" ? "create" : failure}-failure`);
  },
);

it("rejects bridges before editing while a selection is loading", async () => {
  const { controller, summary } = createController();
  const response = Promise.withResolvers<Response>();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => response.promise),
  );
  controller.budget.draft = "130000";
  controller.range.edit(changedRange);
  controller.handleSelectPeriod({ periodId: period.id });
  try {
    controller.handleSavePeriod({ budgetYen: 140_000 });
    controller.handleRangeChange(committedRange);
    expect(executions).toHaveLength(1);
    expect(controller.budget.draft).toBe("130000");
    expect(controller.range.draft).toEqual(changedRange);
  } finally {
    response.resolve(jsonResponse(summary));
    await settled(executions[0]);
  }
});

it.each(["budget", "range"] as const)(
  "reserves queued %s and retains the accepted target and full payload",
  async (operation) => {
    const { controller, summary, revision } = createController();
    const slotStarted = Promise.withResolvers<void>();
    const releaseSlot = Promise.withResolvers<void>();
    const putStarted = Promise.withResolvers<void>();
    const putResponse = Promise.withResolvers<Response>();
    const requests: Array<{ url: string; body: unknown }> = [];
    const other = { ...summary, periodId: "other", budgetYen: 140_000 };
    const payload =
      operation === "budget"
        ? { budgetYen: 130_000, ...committedRange }
        : { budgetYen: 120_000, ...changedRange };
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === periodUrl && init?.method === "PUT") {
          requests.push({ url, body: JSON.parse(String(init.body)) });
          putStarted.resolve();
          return putResponse.promise;
        }
        if (url === "/api/periods/other")
          return Promise.resolve(jsonResponse(other));
        throw new Error(`Unexpected fetch: ${init?.method ?? "GET"} ${url}`);
      }),
    );
    const earlierAdd = Effect.runPromise(
      revision.withMutationSlot(
        period.id,
        "add",
        Effect.gen(function* () {
          slotStarted.resolve();
          yield* Effect.promise(() => releaseSlot.promise);
        }),
      ),
    );
    try {
      await settled(slotStarted.promise);
      controller.budget.draft = "130000";
      controller.range.edit(changedRange);
      if (operation === "budget") controller.saveBudget();
      else controller.saveRange();
      expect(controller[operation].saving).toBe(true);
      expect(controller.periodInteractionDisabled).toBe(true);
      expect(requests).toEqual([]);
      controller.handleSavePeriod({ budgetYen: 140_000 });
      controller.handleRangeChange(committedRange);
      controller.createInitialPeriod();
      expect(executions).toHaveLength(1);
      controller.budget.draft = "150000";
      controller.range.edit({ startDate: "", endDate: "invalid" });
      controller.handleSelectPeriod({ periodId: "other" });
      await settled(executions[1]);
      expect(controller.summary).toEqual(other);
      expect(controller[operation].saving).toBe(true);
      expect(controller.periodInteractionDisabled).toBe(true);
      releaseSlot.resolve();
      await settled(putStarted.promise);
      expect(requests).toEqual([{ url: periodUrl, body: payload }]);
    } finally {
      releaseSlot.resolve();
      putResponse.resolve(jsonResponse({ ...summary, ...payload }));
      await settled(earlierAdd);
      await settled(Promise.all(executions));
    }
    expect(controller.summary).toEqual(other);
    expect(controller.budget.draft).toBe("140000");
    expect(controller[operation].success).toBe(false);
    expect(controller[operation].serverError).toBeNull();
    expect(controller.periodInteractionDisabled).toBe(false);
  },
);

it.each([
  { operation: "budget", externalSetting: false },
  { operation: "range", externalSetting: false },
  { operation: "budget", externalSetting: true },
  { operation: "range", externalSetting: true },
] as const)(
  "reconciles stale $operation success only without an external own-setting change ($externalSetting)",
  async ({ operation, externalSetting }) => {
    const { controller, summary, revision } = createController();
    const started = Promise.withResolvers<void>();
    const response = Promise.withResolvers<Response>();
    const payload =
      operation === "budget"
        ? { budgetYen: 130_000, ...committedRange }
        : { budgetYen: 120_000, ...changedRange };
    const spending = {
      ...summary,
      plannedTotalYen: 1_000,
      spentToDateYen: 1_000,
      dailyRows: summary.dailyRows.map((row, i) =>
        i === 0 ? { ...row, usedYen: 1_000 } : row,
      ),
    };
    const authoritative = { ...spending, ...payload };
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === periodUrl && init?.method === "PUT") {
          started.resolve();
          return response.promise;
        }
        if (url === "/api/periods")
          return Promise.resolve(
            jsonResponse({ periods: [{ ...period, ...payload }] }),
          );
        if (url === periodUrl)
          return Promise.resolve(jsonResponse(authoritative));
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );
    controller.budget.draft = "130000";
    controller.range.edit(changedRange);
    if (operation === "budget") controller.saveBudget();
    else controller.saveRange();
    try {
      await settled(started.promise);
      revision.publish(
        {
          ...spending,
          ...(externalSetting
            ? operation === "budget"
              ? { budgetYen: 140_000 }
              : { startDate: "2026-09-03", endDate: "2026-09-28" }
            : {}),
        },
        controller.setSummary,
      );
      expect(controller[operation].settingChanged).toBe(externalSetting);
    } finally {
      response.resolve(jsonResponse({ ...summary, ...payload }));
      await settled(executions[0]);
    }
    expect(controller.summary).toEqual(authoritative);
    expect(controller[operation].success).toBe(!externalSetting);
    expect(controller[operation].settingChanged).toBe(externalSetting);
    expect(controller.budget.draft).toBe("130000");
    expect(controller.range.draft).toEqual(changedRange);
    expect(
      controller[operation === "budget" ? "range" : "budget"].success,
    ).toBe(false);
    expect(controller.periodInteractionDisabled).toBe(false);
  },
);

it.each(["budget", "range"] as const)(
  "keeps an unreadable %s mutation response as an operation-local failure",
  async (operation) => {
    const { controller, summary } = createController();
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input),
          method = init?.method ?? "GET";
        requests.push(`${method} ${url}`);
        if (method === "PUT" && url === periodUrl)
          return Promise.resolve(
            new Response("{", {
              status: 200,
              headers: { "content-type": "application/json" },
            }),
          );
        if (url === "/api/periods")
          return Promise.resolve(jsonResponse({ periods: [period] }));
        if (url === periodUrl) return Promise.resolve(jsonResponse(summary));
        throw new Error(`Unexpected fetch: ${method} ${url}`);
      }),
    );
    controller.budget.draft = "130000";
    controller.range.edit(changedRange);
    if (operation === "budget") controller.saveBudget();
    else controller.saveRange();
    await settled(executions[0]);
    expect(requests).toEqual([
      `PUT ${periodUrl}`,
      "GET /api/periods",
      `GET ${periodUrl}`,
    ]);
    expect(controller.summary).toEqual(summary);
    expect(controller[operation].serverError).toBe("保存に失敗しました。");
    expect(controller[operation].success).toBe(false);
    expect(controller[operation].dirty).toBe(true);
    expect(
      controller[operation === "budget" ? "range" : "budget"].serverError,
    ).toBeNull();
    expect(controller.periodError).toBeNull();
    expect(controller.periodInteractionDisabled).toBe(false);
  },
);

it("does not publish an old reconciliation error after A to B to A", async () => {
  const { controller, summary } = createController();
  const listStarted = Promise.withResolvers<void>();
  const listResponse = Promise.withResolvers<Response>();
  const other = { ...summary, periodId: "other", budgetYen: 140_000 };
  const requests: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input),
        method = init?.method ?? "GET";
      requests.push(`${method} ${url}`);
      if (url === periodUrl && method === "PUT")
        return Promise.resolve(
          jsonResponse({ ...summary, budgetYen: 130_000 }),
        );
      if (url === "/api/periods") {
        listStarted.resolve();
        return listResponse.promise;
      }
      if (url === "/api/periods/other")
        return Promise.resolve(jsonResponse(other));
      if (url === periodUrl) return Promise.resolve(jsonResponse(summary));
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    }),
  );
  controller.handleSavePeriod({ budgetYen: 130_000 });
  try {
    await settled(listStarted.promise);
    controller.handleSelectPeriod({ periodId: "other" });
    await settled(executions[1]);
    controller.handleSelectPeriod({ periodId: period.id });
    await settled(executions[2]);
    controller.budget.draft = "150000";
    controller.range.edit(changedRange);
    expect(controller.budget.success).toBe(false);
    expect(controller.periodInteractionDisabled).toBe(true);
  } finally {
    listResponse.resolve(
      jsonResponse({ error: { message: "old-list-failure" } }, 503),
    );
    await settled(executions[0]);
  }
  expect(requests).toEqual([
    `PUT ${periodUrl}`,
    "GET /api/periods",
    "GET /api/periods/other",
    `GET ${periodUrl}`,
  ]);
  expect(controller.summary).toEqual(summary);
  expect(controller.budget.draft).toBe("150000");
  expect(controller.range.draft).toEqual(changedRange);
  expect(controller.budget.serverError).toBeNull();
  expect(controller.budget.success).toBe(false);
  expect(controller.periodInteractionDisabled).toBe(false);
});

it("holds create-only saving through its successful list and summary refresh", async () => {
  const { controller, summary } = createController();
  const listStarted = Promise.withResolvers<void>();
  const listResponse = Promise.withResolvers<Response>();
  const summaryStarted = Promise.withResolvers<void>();
  const summaryResponse = Promise.withResolvers<Response>();
  const createdPeriod = {
    ...period,
    id: "p-2026-10-01",
    startDate: "2026-10-01",
    endDate: "2026-10-30",
  };
  const createdSummary = {
    ...summary,
    periodId: createdPeriod.id,
    startDate: createdPeriod.startDate,
    endDate: createdPeriod.endDate,
  };
  const posts: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/periods" && init?.method === "POST") {
        posts.push(JSON.parse(String(init.body)));
        return Promise.resolve(jsonResponse({ id: createdPeriod.id }));
      }
      if (url === "/api/periods") {
        listStarted.resolve();
        return listResponse.promise;
      }
      if (url === `/api/periods/${createdPeriod.id}`) {
        summaryStarted.resolve();
        return summaryResponse.promise;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }),
  );
  controller.createInitialPeriod();
  function assertCreating() {
    expect(controller.periodSaving).toBe(true);
    expect(controller.periodInteractionDisabled).toBe(true);
    expect(controller.budget.saving).toBe(false);
    expect(controller.range.saving).toBe(false);
    controller.createInitialPeriod();
    expect(executions).toHaveLength(1);
  }
  try {
    assertCreating();
    await settled(listStarted.promise);
    assertCreating();
    listResponse.resolve(jsonResponse({ periods: [period, createdPeriod] }));
    await settled(summaryStarted.promise);
    assertCreating();
  } finally {
    listResponse.resolve(jsonResponse({ periods: [period, createdPeriod] }));
    summaryResponse.resolve(jsonResponse(createdSummary));
    await settled(executions[0]);
  }
  expect(posts).toHaveLength(1);
  expect(controller.summary).toEqual(createdSummary);
  expect(controller.periodSaving).toBe(false);
  expect(controller.periodInteractionDisabled).toBe(false);
  expect(controller.periodError).toBeNull();
  expect(controller.budget.success).toBe(false);
  expect(controller.range.success).toBe(false);
});
