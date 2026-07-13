import { Effect } from "effect";
import { afterEach, expect, it, vi } from "vitest";
import { createDayEntryControllerState } from "$lib/dashboard/day-entry-controller-state.svelte";
import { createHistoryControllerState } from "$lib/dashboard/history-controller-state.svelte";
import { createPeriodControllerState } from "$lib/dashboard/period-controller-state.svelte";
import { createPeriodSummaryRevision } from "$lib/dashboard/period-summary-revision";
import type { PeriodSummary } from "$lib/dashboard/controller-types";
import {
  createSummary,
  jsonResponse,
} from "./day-entry-controller-test-fixtures";

afterEach(() => vi.unstubAllGlobals());

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
  revision: ReturnType<typeof createPeriodSummaryRevision>,
) {
  return createPeriodControllerState(
    {
      today: "2026-07-12",
      periods: [period],
      selectedPeriodId: period.id,
      summary,
    },
    revision,
  );
}

it("runs a period update after an active add", async () => {
  const addResponse = Promise.withResolvers<Response>();
  const putResponse = Promise.withResolvers<Response>();
  const initialSummary = createSummary(0);
  const addedSummary = createSummary(2_000);
  const completeSummary = withBudget(createSummary(2_000), 12_000);
  const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "POST") return addResponse.promise;
    if (method === "PUT") return putResponse.promise;
    return Promise.resolve(jsonResponse({ error: {} }, 503));
  });
  vi.stubGlobal("fetch", fetchMock);
  const revision = createPeriodSummaryRevision();
  const periodController = createPeriodController(initialSummary, revision);
  const dayController = createDayEntryControllerState(
    {
      getSelectedPeriodId: () => period.id,
      getSummary: () => periodController.summary,
      historyController: {
        getMutationSequence: () => 0,
        loadHistory: vi.fn(),
        loadHistoryEffect: () => Effect.void,
        resetHistories: vi.fn(),
      },
      setSummary: periodController.setSummary,
    },
    revision,
  );

  dayController.submitDayEntry({
    date: "2026-07-12",
    inputYen: 2_000,
    memo: "add",
  });
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  periodController.handleSavePeriod({ budgetYen: 12_000 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(fetchMock).toHaveBeenCalledOnce();
  addResponse.resolve(jsonResponse(addedSummary));
  await vi.waitFor(() =>
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "PUT"),
    ).toBe(true),
  );
  putResponse.resolve(jsonResponse(completeSummary));
  await vi.waitFor(() => expect(periodController.periodSaving).toBe(false));

  expect(periodController.summary).toEqual(completeSummary);
});

it("runs a history mutation after an active period update", async () => {
  const putResponse = Promise.withResolvers<Response>();
  const historyResponse = Promise.withResolvers<Response>();
  const initialSummary = createSummary(0);
  const updatedPeriodSummary = withBudget(initialSummary, 12_000);
  const completeSummary = withBudget(createSummary(1_000), 12_000);
  const histories = [{ id: "history-1" }];
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method === "PUT") return putResponse.promise;
    if (method === "PATCH") return historyResponse.promise;
    if (url.endsWith("/history")) {
      return Promise.resolve(jsonResponse({ histories }));
    }
    return Promise.resolve(jsonResponse({ error: {} }, 503));
  });
  vi.stubGlobal("fetch", fetchMock);
  const revision = createPeriodSummaryRevision();
  const periodController = createPeriodController(initialSummary, revision);
  const historyController = createHistoryControllerState(
    {
      getSelectedDate: () => "2026-07-12",
      getSelectedPeriodId: () => period.id,
      getSummary: () => periodController.summary,
      setSelectedRow: vi.fn(),
      setSummary: (nextSummary) => {
        periodController.setSummary(nextSummary);
      },
    },
    revision,
  );

  periodController.handleSavePeriod({ budgetYen: 12_000 });
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  historyController.updateHistory({
    historyId: "history-1",
    inputYen: 1_000,
    memo: "edit",
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(fetchMock).toHaveBeenCalledOnce();
  putResponse.resolve(jsonResponse(updatedPeriodSummary));
  await vi.waitFor(() =>
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH"),
    ).toBe(true),
  );
  historyResponse.resolve(
    jsonResponse({ summary: completeSummary, histories }),
  );
  await vi.waitFor(() =>
    expect(historyController.historyMutatingId).toBeNull(),
  );

  expect(periodController.summary).toEqual(completeSummary);
});
