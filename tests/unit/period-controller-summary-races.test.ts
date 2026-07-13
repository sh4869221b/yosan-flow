import { Effect } from "effect";
import { afterEach, expect, it, vi } from "vitest";
import { createDayEntryControllerState } from "$lib/dashboard/day-entry-controller-state.svelte";
import { createPeriodControllerState } from "$lib/dashboard/period-controller-state.svelte";
import { createPeriodSummaryRevision } from "$lib/dashboard/period-summary-revision";
import type { PeriodSummary } from "$lib/dashboard/controller-types";
import {
  createSummary,
  jsonResponse,
} from "./day-entry-controller-test-fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

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
  vi.stubGlobal(
    "fetch",
    vi.fn(() => staleResponse.promise),
  );
  const summaryRevision = createPeriodSummaryRevision();
  const staleSummary = createSummary(0);
  const newerSummary = createSummary(2_000);
  const controller = createPeriodController(staleSummary, summaryRevision);

  controller.handleSelectPeriod({ periodId: period.id });
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  summaryRevision.publish(newerSummary, controller.setSummary);
  staleResponse.resolve(jsonResponse(staleSummary));

  await vi.waitFor(() => expect(controller.summaryLoading).toBe(false));
  expect(controller.summary).toEqual(newerSummary);
});

it("reconciles a period PUT body captured before a newer summary", async () => {
  const putResponse = Promise.withResolvers<Response>();
  const listResponse = Promise.withResolvers<Response>();
  const summaryRevision = createPeriodSummaryRevision();
  const initialSummary = createSummary(0);
  const newerAddSummary = createSummary(2_000);
  const stalePutSummary = withBudget(initialSummary, 12_000);
  const authoritativeSummary = withBudget(newerAddSummary, 12_000);
  const fetchMock = vi
    .fn()
    .mockImplementationOnce(() => putResponse.promise)
    .mockImplementationOnce(() => listResponse.promise)
    .mockResolvedValueOnce(jsonResponse(authoritativeSummary));
  vi.stubGlobal("fetch", fetchMock);
  const controller = createPeriodController(initialSummary, summaryRevision);

  controller.handleSavePeriod({ budgetYen: 12_000 });
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  const newerMutation = summaryRevision.beginMutation(period.id);
  summaryRevision.publish(newerAddSummary, controller.setSummary);
  summaryRevision.completeMutation(period.id, newerMutation);
  putResponse.resolve(jsonResponse(stalePutSummary));
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

  expect(controller.summary).toEqual(newerAddSummary);
  listResponse.resolve(
    jsonResponse({ periods: [{ ...period, budgetYen: 12_000 }] }),
  );
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  await vi.waitFor(() =>
    expect(controller.summary).toEqual(authoritativeSummary),
  );
  expect(controller.periodSaving).toBe(false);
});

it("keeps a later period PUT authoritative over an older add response", async () => {
  const addResponse = Promise.withResolvers<Response>();
  const putResponse = Promise.withResolvers<Response>();
  const initialSummary = createSummary(0);
  const oldAddSummary = createSummary(2_000);
  const updatedSummary = withBudget(oldAddSummary, 12_000);
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method === "POST" && url.endsWith("/add")) {
      return addResponse.promise;
    }
    if (method === "PUT") {
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
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  periodController.handleSavePeriod({ budgetYen: 12_000 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(fetchMock).toHaveBeenCalledOnce();
  addResponse.resolve(jsonResponse(oldAddSummary));
  await vi.waitFor(() =>
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "PUT"),
    ).toBe(true),
  );
  putResponse.resolve(jsonResponse(updatedSummary));
  await vi.waitFor(() => expect(periodController.periodSaving).toBe(false));

  expect(periodController.summary).toEqual(updatedSummary);
  expect(periodController.periodError).toBe("保存に失敗しました。");
});

it("does not let add reconciliation overwrite a newer period update", async () => {
  const staleAddRefresh = Promise.withResolvers<Response>();
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
  await vi.waitFor(() => expect(periodGetCount).toBe(1));
  periodController.handleSavePeriod({ budgetYen: 12_000 });
  await vi.waitFor(() =>
    expect(periodController.summary).toEqual(updatedSummary),
  );

  staleAddRefresh.resolve(jsonResponse(addedSummary));
  await vi.waitFor(() => expect(periodController.periodSaving).toBe(false));
  expect(periodController.summary).toEqual(updatedSummary);
});
