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
const otherPeriod = {
  ...period,
  id: "period-2",
  startDate: "2026-07-14",
  endDate: "2026-07-15",
};

function forPeriod(summary: PeriodSummary, periodId: string): PeriodSummary {
  return { ...summary, periodId };
}

function createPeriodController(
  summary: PeriodSummary,
  summaryRevision = createPeriodSummaryRevision(),
  onPeriodChanged: () => void = () => undefined,
) {
  return createPeriodControllerState(
    {
      today: "2026-07-12",
      periods: [period, otherPeriod],
      selectedPeriodId: period.id,
      summary,
    },
    summaryRevision,
    onPeriodChanged,
  );
}

it("selects a fetched period before an old add settles in the same turn", async () => {
  const oldAddResponse = Promise.withResolvers<Response>();
  const selectedPeriodResponse = Promise.withResolvers<Response>();
  const summaryRevision = createPeriodSummaryRevision();
  const initialSummary = createSummary(0);
  const oldAddSummary = createSummary(2_000);
  const selectedSummary = forPeriod(createSummary(0), otherPeriod.id);
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method === "POST" && url.endsWith("/add")) {
      return oldAddResponse.promise;
    }
    if (method === "GET" && url.endsWith(`/${otherPeriod.id}`)) {
      return selectedPeriodResponse.promise;
    }
    if (method === "GET" && url.endsWith(`/${period.id}`)) {
      return Promise.resolve(jsonResponse({ error: {} }, 503));
    }
    throw new Error(`Unexpected fetch: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  let closeDayEntry = (): void => undefined;
  const periodController = createPeriodController(
    initialSummary,
    summaryRevision,
    () => closeDayEntry(),
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
  closeDayEntry = dayEntryController.closeDayEntry;

  dayEntryController.openDayEntry({ date: "2026-07-12" });
  dayEntryController.submitDayEntry({
    date: "2026-07-12",
    inputYen: 2_000,
    memo: "old period add",
  });
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  periodController.handleSelectPeriod({ periodId: otherPeriod.id });
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

  selectedPeriodResponse.resolve(jsonResponse(selectedSummary));
  await vi.waitFor(() =>
    expect(periodController.selectedPeriodId).toBe(otherPeriod.id),
  );
  expect(dayEntryController.modalOpen).toBe(false);
  oldAddResponse.resolve(jsonResponse(oldAddSummary));

  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  expect(periodController.selectedPeriodId).toBe(otherPeriod.id);
  expect(periodController.summary).toEqual(selectedSummary);
});

it("clears summary loading when a superseding period-list request fails", async () => {
  const staleSelectionResponse = Promise.withResolvers<Response>();
  const initialSummary = createSummary(0);
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method === "GET" && url.endsWith(`/${otherPeriod.id}`)) {
      return staleSelectionResponse.promise;
    }
    if (method === "POST" && url === "/api/periods") {
      return Promise.resolve(jsonResponse({ id: "period-3" }));
    }
    if (method === "GET" && url === "/api/periods") {
      return Promise.resolve(jsonResponse({ error: {} }, 503));
    }
    throw new Error(`Unexpected fetch: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  const controller = createPeriodController(initialSummary);

  controller.handleSelectPeriod({ periodId: otherPeriod.id });
  await vi.waitFor(() => expect(controller.summaryLoading).toBe(true));
  controller.createInitialPeriod();
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  await vi.waitFor(() => expect(controller.periodSaving).toBe(false));

  expect(controller.summaryLoading).toBe(false);
  staleSelectionResponse.resolve(
    jsonResponse(forPeriod(createSummary(0), otherPeriod.id)),
  );
  await vi.waitFor(() => expect(controller.summaryLoading).toBe(false));
  expect(controller.summary).toEqual(initialSummary);
});

it("keeps selection owned by the visible summary when a created period summary fails", async () => {
  const initialSummary = createSummary(0);
  const createdPeriod = {
    ...otherPeriod,
    id: "period-3",
    startDate: "2026-07-16",
    endDate: "2026-07-17",
  };
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method === "POST" && url === "/api/periods") {
      return Promise.resolve(jsonResponse({ id: createdPeriod.id }));
    }
    if (method === "GET" && url === "/api/periods") {
      return Promise.resolve(
        jsonResponse({ periods: [period, otherPeriod, createdPeriod] }),
      );
    }
    if (method === "GET" && url.endsWith(`/${createdPeriod.id}`)) {
      return Promise.resolve(jsonResponse({ error: {} }, 503));
    }
    throw new Error(`Unexpected fetch: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  const controller = createPeriodController(initialSummary);

  controller.createInitialPeriod();
  await vi.waitFor(() => expect(controller.periodSaving).toBe(false));

  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(controller.periods).toContainEqual(createdPeriod);
  expect(controller.selectedPeriodId).toBe(period.id);
  expect(controller.summary).toEqual(initialSummary);
  expect(controller.summaryLoading).toBe(false);
  expect(controller.summaryError).toBe("再取得に失敗しました。");
});

it("does not let a queued period update reclaim a newer selection", async () => {
  const addResponse = Promise.withResolvers<Response>();
  const updateResponse = Promise.withResolvers<Response>();
  const summaryRevision = createPeriodSummaryRevision();
  const initialSummary = createSummary(0);
  const selectedSummary = forPeriod(createSummary(0), otherPeriod.id);
  const updatedOldSummary = { ...createSummary(1_000), budgetYen: 12_000 };
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method === "POST" && url.endsWith("/add")) {
      return addResponse.promise;
    }
    if (method === "PUT" && url.endsWith(`/${period.id}`)) {
      return updateResponse.promise;
    }
    if (method === "GET" && url.endsWith(`/${otherPeriod.id}`)) {
      return Promise.resolve(jsonResponse(selectedSummary));
    }
    if (method === "GET" && url.endsWith(`/${period.id}`)) {
      return Promise.resolve(jsonResponse({ error: {} }, 503));
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

  dayEntryController.submitDayEntry({
    date: "2026-07-12",
    inputYen: 1_000,
    memo: "slot owner",
  });
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  periodController.handleSavePeriod({ budgetYen: 12_000 });
  periodController.handleSelectPeriod({ periodId: otherPeriod.id });
  await vi.waitFor(() =>
    expect(periodController.selectedPeriodId).toBe(otherPeriod.id),
  );

  addResponse.resolve(jsonResponse(createSummary(1_000)));
  await vi.waitFor(() =>
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "PUT"),
    ).toBe(true),
  );
  updateResponse.resolve(jsonResponse(updatedOldSummary));
  await vi.waitFor(() => expect(periodController.periodSaving).toBe(false));

  expect(periodController.selectedPeriodId).toBe(otherPeriod.id);
  expect(periodController.summary).toEqual(selectedSummary);
});
