import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDayEntryControllerState } from "$lib/dashboard/day-entry-controller-state.svelte";
import type { PeriodSummary } from "$lib/dashboard/controller-types";

afterEach(() => {
  vi.unstubAllGlobals();
});

function createSummary(
  periodId: string,
  date: string,
  usedYen: number,
): PeriodSummary {
  return {
    periodId,
    startDate: date,
    endDate: date,
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
        date,
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

describe("day-entry controller period submission sequence", () => {
  it("applies a successful save after a later save in another period", async () => {
    const periodAResponse = Promise.withResolvers<Response>();
    const periodAInitial = createSummary("period-a", "2026-07-12", 0);
    const periodACommitted = createSummary("period-a", "2026-07-12", 2_000);
    const periodBInitial = createSummary("period-b", "2026-07-13", 0);
    const periodBCommitted = createSummary("period-b", "2026-07-13", 3_000);
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => periodAResponse.promise)
      .mockResolvedValueOnce(jsonResponse(periodBCommitted))
      .mockResolvedValueOnce(jsonResponse({ error: {} }, 503))
      .mockResolvedValueOnce(jsonResponse({ error: {} }, 503));
    vi.stubGlobal("fetch", fetchMock);
    let selectedPeriodId = "period-a";
    let summary = periodAInitial;
    const controller = createDayEntryControllerState({
      getSelectedPeriodId: () => selectedPeriodId,
      getSummary: () => summary,
      historyController: {
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
      memo: "period A",
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    selectedPeriodId = "period-b";
    summary = periodBInitial;
    controller.openDayEntry({ date: "2026-07-13" });
    controller.submitDayEntry({
      date: "2026-07-13",
      inputYen: 3_000,
      memo: "period B",
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(summary).toEqual(periodBCommitted);

    selectedPeriodId = "period-a";
    summary = periodAInitial;
    periodAResponse.resolve(jsonResponse(periodACommitted));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    await vi.waitFor(() => expect(summary).toEqual(periodACommitted));
  });
});
