import { Effect } from "effect";
import { afterEach, expect, it, vi } from "vitest";
import { createDayEntryControllerState } from "$lib/dashboard/day-entry-controller-state.svelte";
import type { PeriodSummary } from "$lib/dashboard/controller-types";

afterEach(() => {
  vi.unstubAllGlobals();
});

function createSummary(firstUsedYen: number, secondUsedYen = 0): PeriodSummary {
  const plannedTotalYen = firstUsedYen + secondUsedYen;
  return {
    periodId: "period-1",
    startDate: "2026-07-12",
    endDate: "2026-07-13",
    budgetYen: 10_000,
    status: "active",
    periodLengthDays: 2,
    spentToDateYen: plannedTotalYen,
    plannedTotalYen,
    remainingYen: 10_000 - plannedTotalYen,
    overspentYen: 0,
    todayRecommendedYen: 5_000,
    varianceFromRecommendationYen: 0,
    remainingAfterDayYenPreview: 10_000,
    daysRemaining: 2,
    foodPace: {
      status: "on_track",
      baseDailyYen: 5_000,
      todayBonusYen: 0,
      adjustmentYen: 0,
      totalAdjustmentYen: 0,
      todayAllowanceYen: 5_000,
      usedTodayYen: firstUsedYen,
      todayRemainingYen: 5_000 - firstUsedYen,
    },
    dailyRows: [
      {
        date: "2026-07-12",
        label: "today",
        usedYen: firstUsedYen,
        recommendedYen: 5_000,
      },
      {
        date: "2026-07-13",
        label: "planned",
        usedYen: secondUsedYen,
        recommendedYen: 5_000,
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

it("keeps the fullest concurrent add summary when reconciliation fails", async () => {
  // Given
  const firstResponse = Promise.withResolvers<Response>();
  const secondResponse = Promise.withResolvers<Response>();
  const partialSummary = createSummary(0, 3_000);
  const combinedSummary = createSummary(2_000, 3_000);
  const fetchMock = vi
    .fn()
    .mockImplementationOnce(() => firstResponse.promise)
    .mockImplementationOnce(() => secondResponse.promise)
    .mockResolvedValueOnce(jsonResponse({ error: {} }, 503));
  vi.stubGlobal("fetch", fetchMock);
  let summary = createSummary(0);
  const controller = createDayEntryControllerState({
    getSelectedPeriodId: () => "period-1",
    getSummary: () => summary,
    historyController: {
      getMutationSequence: () => 0,
      loadHistory: vi.fn(),
      loadHistoryEffect: () => Effect.void,
      resetHistories: vi.fn(),
    },
    setSummary: (nextSummary) => {
      summary = nextSummary;
    },
  });
  controller.openDayEntry({ date: "2026-07-12" });
  controller.submitDayEntry({
    date: "2026-07-12",
    inputYen: 2_000,
    memo: "first",
  });
  controller.openDayEntry({ date: "2026-07-13" });
  controller.submitDayEntry({
    date: "2026-07-13",
    inputYen: 3_000,
    memo: "second",
  });
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

  // When
  secondResponse.resolve(jsonResponse(partialSummary));
  await vi.waitFor(() => expect(summary).toEqual(partialSummary));
  firstResponse.resolve(jsonResponse(combinedSummary));

  // Then
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  await vi.waitFor(() => expect(summary).toEqual(combinedSummary));
});

it("applies an off-screen successful body after returning to its period", async () => {
  const firstResponse = Promise.withResolvers<Response>();
  const secondResponse = Promise.withResolvers<Response>();
  const committedSummary = createSummary(2_000);
  const periodBSummary = { ...createSummary(0), periodId: "period-2" };
  const fetchMock = vi
    .fn()
    .mockImplementationOnce(() => firstResponse.promise)
    .mockImplementationOnce(() => secondResponse.promise)
    .mockResolvedValueOnce(jsonResponse({ error: {} }, 503));
  vi.stubGlobal("fetch", fetchMock);
  let selectedPeriodId = "period-1";
  let summary = createSummary(0);
  const controller = createDayEntryControllerState({
    getSelectedPeriodId: () => selectedPeriodId,
    getSummary: () => summary,
    historyController: {
      getMutationSequence: () => 0,
      loadHistory: vi.fn(),
      loadHistoryEffect: () => Effect.void,
      resetHistories: vi.fn(),
    },
    setSummary: (nextSummary) => {
      summary = nextSummary;
    },
  });
  controller.openDayEntry({ date: "2026-07-12" });
  controller.submitDayEntry({
    date: "2026-07-12",
    inputYen: 2_000,
    memo: "committed",
  });
  controller.submitDayEntry({
    date: "2026-07-13",
    inputYen: 3_000,
    memo: "failed",
  });
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

  selectedPeriodId = "period-2";
  summary = periodBSummary;
  firstResponse.resolve(jsonResponse(committedSummary));
  await vi.waitFor(() => expect(controller.modalOpen).toBe(false));
  expect(summary).toEqual(periodBSummary);
  selectedPeriodId = "period-1";
  summary = createSummary(0);
  secondResponse.resolve(jsonResponse({ error: {} }, 503));

  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  await vi.waitFor(() => expect(summary).toEqual(committedSummary));
});
