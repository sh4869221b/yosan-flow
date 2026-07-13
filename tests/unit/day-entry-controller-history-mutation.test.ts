import { afterEach, expect, it, vi } from "vitest";
import { createDayEntryControllerState } from "$lib/dashboard/day-entry-controller-state.svelte";
import { createHistoryControllerState } from "$lib/dashboard/history-controller-state.svelte";
import type { PeriodSummary } from "$lib/dashboard/controller-types";

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
