import { Effect } from "effect";
import { afterEach, expect, it, vi } from "vitest";
import { createDayEntryControllerState } from "$lib/dashboard/day-entry-controller-state.svelte";
import { createHistoryControllerState } from "$lib/dashboard/history-controller-state.svelte";
import { createPeriodUpdateEffect } from "$lib/dashboard/period-controller-update-effect";
import { createPeriodSummaryRequestTracker } from "$lib/dashboard/period-summary-request-tracker";
import { createPeriodSummaryRevision } from "$lib/dashboard/period-summary-revision";
import type { PeriodSummary } from "$lib/dashboard/controller-types";
import type { HistoryItem } from "$lib/dashboard/types";
import {
  createSummary,
  jsonResponse,
} from "./day-entry-controller-test-fixtures";

afterEach(() => vi.unstubAllGlobals());

function createHistory(id: string): HistoryItem {
  return {
    id,
    date: "2026-07-12",
    operationType: "add",
    inputYen: 500,
    beforeTotalYen: 0,
    afterTotalYen: 500,
    memo: id,
    createdAt: "2026-07-12T00:00:00.000Z",
  };
}

function invalidJsonResponse(): Response {
  return new Response("{", {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

it("does not publish a reconciliation history load after a later mutation starts", async () => {
  const currentHistory = createHistory("CURRENT");
  const staleHistory = createHistory("STALE_PUBLISHED");
  const staleLoad = Promise.withResolvers<Response>();
  const laterMutation = Promise.withResolvers<Response>();
  const staleResponse = jsonResponse({ histories: [staleHistory] });
  const staleJson = vi.spyOn(staleResponse, "json");
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ histories: [currentHistory] }))
    .mockResolvedValueOnce(invalidJsonResponse())
    .mockResolvedValueOnce(jsonResponse(createSummary(500)))
    .mockImplementationOnce(() => staleLoad.promise)
    .mockImplementationOnce(() => laterMutation.promise);
  vi.stubGlobal("fetch", fetchMock);
  const controller = createHistoryControllerState({
    getSelectedDate: () => "2026-07-12",
    getSelectedPeriodId: () => "period-1",
    getSummary: () => createSummary(0),
    setSelectedRow: vi.fn(),
    setSummary: vi.fn(),
  });

  await Effect.runPromise(controller.loadHistoryEffect("2026-07-12"));
  controller.updateHistory({
    historyId: "history-1",
    inputYen: 500,
    memo: "first",
  });
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
  controller.updateHistory({
    historyId: "history-2",
    inputYen: 600,
    memo: "later",
  });
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));

  staleLoad.resolve(staleResponse);
  await vi.waitFor(() => expect(staleJson).toHaveBeenCalledOnce());

  expect(controller.histories).toEqual([currentHistory]);
  laterMutation.resolve(
    jsonResponse({ summary: createSummary(600), histories: [currentHistory] }),
  );
  await vi.waitFor(() => expect(controller.historyMutatingId).toBeNull());
});

it("publishes an idle reconciliation history load", async () => {
  const refreshedHistory = createHistory("REFRESHED");
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(invalidJsonResponse())
    .mockResolvedValueOnce(jsonResponse(createSummary(500)))
    .mockResolvedValueOnce(jsonResponse({ histories: [refreshedHistory] }));
  vi.stubGlobal("fetch", fetchMock);
  const controller = createHistoryControllerState({
    getSelectedDate: () => "2026-07-12",
    getSelectedPeriodId: () => "period-1",
    getSummary: () => createSummary(0),
    setSelectedRow: vi.fn(),
    setSummary: vi.fn(),
  });

  controller.updateHistory({
    historyId: "history-1",
    inputYen: 500,
    memo: "idle",
  });

  await vi.waitFor(() =>
    expect(controller.histories).toEqual([refreshedHistory]),
  );
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

it("recovers histories after a later period mutation repairs the summary", async () => {
  const currentHistory = createHistory("PRE_MUTATION");
  const authoritativeHistory = createHistory("AUTHORITATIVE");
  const reconciliationSummary = Promise.withResolvers<Response>();
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ histories: [currentHistory] }))
    .mockResolvedValueOnce(invalidJsonResponse())
    .mockImplementationOnce(() => reconciliationSummary.promise)
    .mockResolvedValueOnce(jsonResponse(createSummary(700)))
    .mockResolvedValueOnce(jsonResponse({ histories: [authoritativeHistory] }));
  vi.stubGlobal("fetch", fetchMock);
  const revision = createPeriodSummaryRevision();
  let summary: PeriodSummary = createSummary(0);
  const controller = createHistoryControllerState(
    {
      getSelectedDate: () => "2026-07-12",
      getSelectedPeriodId: () => "period-1",
      getSummary: () => summary,
      setSelectedRow: vi.fn(),
      setSummary: (nextSummary) => {
        summary = nextSummary;
      },
    },
    revision,
  );
  const updatePeriod = createPeriodUpdateEffect({
    getSelectedPeriodId: () => "period-1",
    getSummary: () => summary,
    getSummaryLoading: () => false,
    publishSummary: (nextSummary) => {
      summary = nextSummary;
    },
    refreshPeriodListEffect: () => Effect.void,
    refreshSummaryEffect: () => Effect.void,
    setError: vi.fn(),
    setSaving: vi.fn(),
    summaryRequests: createPeriodSummaryRequestTracker(revision),
    summaryRevision: revision,
  });

  await Effect.runPromise(controller.loadHistoryEffect("2026-07-12"));
  controller.deleteHistory({ historyId: "history-1" });
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

  await Effect.runPromise(
    updatePeriod({
      budgetYen: 12_000,
      startDate: "2026-07-12",
      endDate: "2026-08-10",
    }),
  );
  expect(summary).toEqual(createSummary(700));
  reconciliationSummary.resolve(jsonResponse(createSummary(500)));

  await vi.waitFor(() =>
    expect(controller.histories).toEqual([authoritativeHistory]),
  );
  expect(summary).toEqual(createSummary(700));
  expect(fetchMock).toHaveBeenCalledTimes(5);
});

it("does not publish a reconciliation history load after a later add starts", async () => {
  const currentHistory = createHistory("CURRENT_BEFORE_ADD");
  const staleHistory = createHistory("STALE_DURING_ADD");
  const authoritativeHistory = createHistory("AUTHORITATIVE_AFTER_ADD");
  const staleLoad = Promise.withResolvers<Response>();
  const addResponse = Promise.withResolvers<Response>();
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ histories: [currentHistory] }))
    .mockResolvedValueOnce(invalidJsonResponse())
    .mockResolvedValueOnce(jsonResponse(createSummary(500)))
    .mockImplementationOnce(() => staleLoad.promise)
    .mockImplementationOnce(() => addResponse.promise)
    .mockResolvedValueOnce(jsonResponse(createSummary(2_000)))
    .mockResolvedValueOnce(jsonResponse({ histories: [authoritativeHistory] }));
  vi.stubGlobal("fetch", fetchMock);
  const revision = createPeriodSummaryRevision();
  let summary = createSummary(0);
  const dayControllerRef: {
    current: ReturnType<typeof createDayEntryControllerState> | null;
  } = { current: null };
  const historyController = createHistoryControllerState(
    {
      getSelectedDate: () => dayControllerRef.current?.selectedDate ?? null,
      getSelectedPeriodId: () => "period-1",
      getSummary: () => summary,
      setSelectedRow: (row) => dayControllerRef.current?.setSelectedRow(row),
      setSummary: (nextSummary) => {
        summary = nextSummary;
      },
    },
    revision,
  );
  const dayController = createDayEntryControllerState(
    {
      getSelectedPeriodId: () => "period-1",
      getSummary: () => summary,
      historyController,
      setSummary: (nextSummary) => {
        summary = nextSummary;
      },
    },
    revision,
  );
  dayControllerRef.current = dayController;

  dayController.openDayEntry({ date: "2026-07-12" });
  await vi.waitFor(() =>
    expect(historyController.histories).toEqual([currentHistory]),
  );
  historyController.deleteHistory({ historyId: "history-1" });
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
  dayController.submitDayEntry({
    date: "2026-07-12",
    inputYen: 2_000,
    memo: "later add",
  });
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));

  staleLoad.resolve(jsonResponse({ histories: [staleHistory] }));
  await vi.waitFor(() => expect(historyController.historyLoading).toBe(false));
  expect(historyController.histories).toEqual([currentHistory]);

  addResponse.resolve(jsonResponse(createSummary(2_000)));
  await vi.waitFor(() =>
    expect(historyController.histories).toEqual([authoritativeHistory]),
  );
});
