import { Effect } from "effect";
import { afterEach, expect, it, vi } from "vitest";
import { createDayEntryControllerState } from "$lib/dashboard/day-entry-controller-state.svelte";
import { createHistoryControllerState } from "$lib/dashboard/history-controller-state.svelte";
import type { PeriodSummary } from "$lib/dashboard/controller-types";
import type { HistoryItem } from "$lib/dashboard/types";

afterEach(() => {
  vi.unstubAllGlobals();
});

function createSummary(usedYen: number): PeriodSummary {
  return {
    periodId: "period-1",
    startDate: "2026-07-12",
    endDate: "2026-07-12",
    budgetYen: 10_000,
    status: "active",
    periodLengthDays: 1,
    spentToDateYen: usedYen,
    plannedTotalYen: usedYen,
    remainingYen: 10_000 - usedYen,
    overspentYen: 0,
    todayRecommendedYen: 10_000,
    varianceFromRecommendationYen: 0,
    remainingAfterDayYenPreview: 10_000 - usedYen,
    daysRemaining: 1,
    foodPace: {
      status: "on_track",
      baseDailyYen: 10_000,
      todayBonusYen: 0,
      adjustmentYen: 0,
      totalAdjustmentYen: 0,
      todayAllowanceYen: 10_000,
      usedTodayYen: usedYen,
      todayRemainingYen: 10_000 - usedYen,
    },
    dailyRows: [
      {
        date: "2026-07-12",
        label: "today",
        usedYen,
        recommendedYen: 10_000,
      },
    ],
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function createHistory(id: string, inputYen: number): HistoryItem {
  return {
    id,
    date: "2026-07-12",
    operationType: "add",
    inputYen,
    beforeTotalYen: 0,
    afterTotalYen: inputYen,
    memo: id,
    createdAt: "2026-07-12T00:00:00.000Z",
  };
}

it("rejects a save body captured before a history mutation", async () => {
  const staleSaveResponse = Promise.withResolvers<Response>();
  const staleSummary = createSummary(2_000);
  const editedSummary = createSummary(1_000);
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ histories: [] }))
    .mockImplementationOnce(() => staleSaveResponse.promise)
    .mockResolvedValueOnce(
      jsonResponse({ summary: editedSummary, histories: [] }),
    )
    .mockResolvedValueOnce(jsonResponse({ error: {} }, 503));
  vi.stubGlobal("fetch", fetchMock);
  let summary = createSummary(0);
  const dayEntryControllerRef: {
    current: ReturnType<typeof createDayEntryControllerState> | null;
  } = { current: null };
  const historyController = createHistoryControllerState({
    getSelectedDate: () => dayEntryControllerRef.current?.selectedDate ?? null,
    getSelectedPeriodId: () => "period-1",
    setSelectedRow: (row) => dayEntryControllerRef.current?.setSelectedRow(row),
    setSummary: (nextSummary) => {
      summary = nextSummary;
    },
  });
  const dayEntryController = createDayEntryControllerState({
    getSelectedPeriodId: () => "period-1",
    getSummary: () => summary,
    historyController,
    setSummary: (nextSummary) => {
      summary = nextSummary;
    },
  });
  dayEntryControllerRef.current = dayEntryController;

  dayEntryController.openDayEntry({ date: "2026-07-12" });
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  dayEntryController.submitDayEntry({
    date: "2026-07-12",
    inputYen: 2_000,
    memo: "stale save",
  });
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  historyController.updateHistory({
    historyId: "history-1",
    inputYen: 1_000,
    memo: "edited",
  });
  await vi.waitFor(() => expect(summary).toEqual(editedSummary));

  staleSaveResponse.resolve(jsonResponse(staleSummary));

  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
  await vi.waitFor(() => expect(summary).toEqual(editedSummary));
});

it("keeps another date history load while applying the period summary", async () => {
  const mutationResponse = Promise.withResolvers<Response>();
  const otherDateHistoryResponse = Promise.withResolvers<Response>();
  const mutationSummary = createSummary(1_000);
  const originHistory = createHistory("origin-history", 1_000);
  const otherDateHistory = {
    ...createHistory("other-date-history", 500),
    date: "2026-07-13",
  };
  const fetchMock = vi
    .fn()
    .mockImplementationOnce(() => mutationResponse.promise)
    .mockImplementationOnce(() => otherDateHistoryResponse.promise);
  vi.stubGlobal("fetch", fetchMock);
  let selectedDate = "2026-07-12";
  const setSummary = vi.fn();
  const controller = createHistoryControllerState({
    getSelectedDate: () => selectedDate,
    getSelectedPeriodId: () => "period-1",
    setSelectedRow: vi.fn(),
    setSummary,
  });

  controller.updateHistory({
    historyId: "origin-history",
    inputYen: 1_000,
    memo: "origin edit",
  });
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  selectedDate = "2026-07-13";
  const otherDateLoad = Effect.runPromise(
    controller.loadHistoryEffect(selectedDate),
  );
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

  mutationResponse.resolve(
    jsonResponse({ summary: mutationSummary, histories: [originHistory] }),
  );
  await vi.waitFor(() =>
    expect(setSummary).toHaveBeenCalledWith(mutationSummary),
  );
  otherDateHistoryResponse.resolve(
    jsonResponse({ histories: [otherDateHistory] }),
  );
  await otherDateLoad;

  expect(controller.histories).toEqual([otherDateHistory]);
  expect(controller.historyLoading).toBe(false);
});
