import { Effect } from "effect";
import { expect, it, vi } from "vitest";
import {
  captureClientEffects,
  settled,
} from "./period-controller-effect-fixture";
import { createDayEntryControllerState } from "$lib/dashboard/day-entry-controller-state.svelte";
import { createPeriodControllerState } from "$lib/dashboard/period-controller-state.svelte";
import { createPeriodSummaryRevision } from "$lib/dashboard/period-summary-revision";
import type { PeriodSummary } from "$lib/dashboard/controller-types";
import {
  createSummary,
  jsonResponse,
} from "./day-entry-controller-test-fixtures";

const executions = captureClientEffects();

const period = {
  id: "period-1",
  startDate: "2026-07-12",
  endDate: "2026-07-13",
  budgetYen: 10_000,
  status: "active" as const,
  predecessorPeriodId: null,
  createdAt: "2026-07-12T00:00:00.000Z",
  updatedAt: "2026-07-12T00:00:00.000Z",
};

function withBudget(summary: PeriodSummary, budgetYen: number): PeriodSummary {
  return { ...summary, budgetYen };
}

function createPeriodController(
  summary: PeriodSummary,
  summaryRevision = createPeriodSummaryRevision(),
  periods = [period],
) {
  return createPeriodControllerState(
    {
      today: "2026-07-12",
      periods,
      selectedPeriodId: period.id,
      summary,
    },
    summaryRevision,
  );
}

it("discards a period GET captured before a newer summary publication", async () => {
  const staleResponse = Promise.withResolvers<Response>();
  const started = Promise.withResolvers<void>();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      started.resolve();
      return staleResponse.promise;
    }),
  );
  const summaryRevision = createPeriodSummaryRevision();
  const staleSummary = createSummary(0);
  const newerSummary = createSummary(2_000);
  const controller = createPeriodController(staleSummary, summaryRevision);

  controller.handleSelectPeriod({ periodId: period.id });
  try {
    await settled(started.promise);
    expect(fetch).toHaveBeenCalledOnce();
    summaryRevision.publish(newerSummary, controller.setSummary);
  } finally {
    staleResponse.resolve(jsonResponse(staleSummary));
    await settled(executions[0]);
  }
  expect(controller.summaryLoading).toBe(false);
  expect(controller.summary).toEqual(newerSummary);
});

it("reconciles a period PUT body captured before a newer summary", async () => {
  const putResponse = Promise.withResolvers<Response>();
  const listResponse = Promise.withResolvers<Response>();
  const putStarted = Promise.withResolvers<void>();
  const listStarted = Promise.withResolvers<void>();
  const summaryRevision = createPeriodSummaryRevision();
  const initialSummary = createSummary(0);
  const newerAddSummary = createSummary(2_000);
  const stalePutSummary = withBudget(initialSummary, 12_000);
  const authoritativeSummary = withBudget(newerAddSummary, 12_000);
  const fetchMock = vi
    .fn()
    .mockImplementationOnce(() => {
      putStarted.resolve();
      return putResponse.promise;
    })
    .mockImplementationOnce(() => {
      listStarted.resolve();
      return listResponse.promise;
    })
    .mockResolvedValueOnce(jsonResponse(authoritativeSummary));
  vi.stubGlobal("fetch", fetchMock);
  const controller = createPeriodController(initialSummary, summaryRevision);

  controller.handleSavePeriod({ budgetYen: 12_000 });
  try {
    await settled(putStarted.promise);
    expect(fetchMock).toHaveBeenCalledOnce();
    const newerMutation = summaryRevision.beginMutation(period.id);
    summaryRevision.publish(newerAddSummary, controller.setSummary);
    summaryRevision.completeMutation(period.id, newerMutation);
    putResponse.resolve(jsonResponse(stalePutSummary));
    await settled(listStarted.promise);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(controller.summary).toEqual(newerAddSummary);
    expect(controller.budget.saving).toBe(true);
  } finally {
    putResponse.resolve(jsonResponse(stalePutSummary));
    listResponse.resolve(
      jsonResponse({ periods: [{ ...period, budgetYen: 12_000 }] }),
    );
    await settled(executions[0]);
  }
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(controller.summary).toEqual(authoritativeSummary);
  expect(controller.budget.saving).toBe(false);
});

it("keeps a later period PUT authoritative over an older add response", async () => {
  const addResponse = Promise.withResolvers<Response>();
  const putResponse = Promise.withResolvers<Response>();
  const addStarted = Promise.withResolvers<void>();
  const putStarted = Promise.withResolvers<void>();
  const initialSummary = createSummary(0);
  const oldAddSummary = createSummary(2_000);
  const updatedSummary = withBudget(oldAddSummary, 12_000);
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method === "POST" && url.endsWith("/add")) {
      addStarted.resolve();
      return addResponse.promise;
    }
    if (method === "PUT") {
      putStarted.resolve();
      return putResponse.promise;
    }
    if (method === "GET" && url === "/api/periods") {
      return Promise.resolve(jsonResponse({ error: {} }, 503));
    }
    if (method === "GET" && url === "/api/periods/period-1") {
      return Promise.resolve(jsonResponse({ error: {} }, 503));
    }
    throw new Error(`Unexpected fetch: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  const summaryRevision = createPeriodSummaryRevision();
  const periodController = createPeriodController(
    initialSummary,
    summaryRevision,
  );
  const dayEntryController = createDayEntryControllerState(
    {
      getSelectedPeriodId: () => periodController.selectedPeriodId,
      getSummary: () => periodController.summary,
      historyController: {
        getMutationSequence: () => 0,
        loadHistory: vi.fn(),
        loadHistoryEffect: () => Effect.void,
        resetHistories: vi.fn(),
      },
      setSummary: periodController.setSummary,
    },
    summaryRevision,
  );

  dayEntryController.openDayEntry({ date: "2026-07-12" });
  dayEntryController.submitDayEntry({
    date: "2026-07-12",
    inputYen: 2_000,
    memo: "older add",
  });
  try {
    await settled(addStarted.promise);
    expect(fetchMock).toHaveBeenCalledOnce();
    periodController.handleSavePeriod({ budgetYen: 12_000 });
    expect(periodController.budget.saving).toBe(true);
    expect(executions).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledOnce();
    addResponse.resolve(jsonResponse(oldAddSummary));
    await settled(putStarted.promise);
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "PUT"),
    ).toBe(true);
  } finally {
    addResponse.resolve(jsonResponse(oldAddSummary));
    putResponse.resolve(jsonResponse(updatedSummary));
    await settled(Promise.all(executions));
  }
  expect(periodController.budget.saving).toBe(false);

  expect(periodController.summary).toEqual(updatedSummary);
  expect(periodController.budget.serverError).toBe("保存に失敗しました。");
  expect(periodController.periodError).toBeNull();
});

it("does not let add reconciliation overwrite a newer period update", async () => {
  const staleAddRefresh = Promise.withResolvers<Response>();
  const staleRefreshStarted = Promise.withResolvers<void>();
  const summaryRevision = createPeriodSummaryRevision();
  const initialSummary = createSummary(0);
  const addedSummary = createSummary(2_000);
  const updatedSummary = withBudget(addedSummary, 12_000);
  let periodGetCount = 0;
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method === "POST" && url.endsWith("/add")) {
      return Promise.resolve(jsonResponse(addedSummary));
    }
    if (method === "PUT") {
      return Promise.resolve(jsonResponse(updatedSummary));
    }
    if (method === "GET" && url === "/api/periods") {
      return Promise.resolve(
        jsonResponse({ periods: [{ ...period, budgetYen: 12_000 }] }),
      );
    }
    if (method === "GET" && url === "/api/periods/period-1") {
      periodGetCount += 1;
      if (periodGetCount === 1) staleRefreshStarted.resolve();
      return periodGetCount === 1
        ? staleAddRefresh.promise
        : Promise.resolve(jsonResponse(updatedSummary));
    }
    throw new Error(`Unexpected fetch: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  const periodController = createPeriodController(
    initialSummary,
    summaryRevision,
  );
  const dayEntryController = createDayEntryControllerState(
    {
      getSelectedPeriodId: () => periodController.selectedPeriodId,
      getSummary: () => periodController.summary,
      historyController: {
        getMutationSequence: () => 0,
        loadHistory: vi.fn(),
        loadHistoryEffect: () => Effect.void,
        resetHistories: vi.fn(),
      },
      setSummary: periodController.setSummary,
    },
    summaryRevision,
  );

  dayEntryController.openDayEntry({ date: "2026-07-12" });
  dayEntryController.submitDayEntry({
    date: "2026-07-12",
    inputYen: 2_000,
    memo: "add before period update",
  });
  try {
    await settled(staleRefreshStarted.promise);
    expect(periodGetCount).toBe(1);
    periodController.handleSavePeriod({ budgetYen: 12_000 });
    await settled(executions[1]);
    expect(periodController.summary).toEqual(updatedSummary);
  } finally {
    staleAddRefresh.resolve(jsonResponse(addedSummary));
    await settled(Promise.all(executions));
  }
  expect(periodController.budget.saving).toBe(false);
  expect(periodController.summary).toEqual(updatedSummary);
});
