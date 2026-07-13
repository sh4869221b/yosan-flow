import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDayEntryControllerState } from "$lib/dashboard/day-entry-controller-state.svelte";
import type { PeriodSummary } from "$lib/dashboard/controller-types";

afterEach(() => {
  vi.unstubAllGlobals();
});

function createSummary(): PeriodSummary {
  return {
    periodId: "period-1",
    startDate: "2026-07-12",
    endDate: "2026-07-12",
    budgetYen: 10_000,
    status: "active",
    periodLengthDays: 1,
    spentToDateYen: 2_000,
    plannedTotalYen: 2_000,
    remainingYen: 8_000,
    overspentYen: 0,
    todayRecommendedYen: 10_000,
    varianceFromRecommendationYen: 0,
    remainingAfterDayYenPreview: 8_000,
    daysRemaining: 1,
    foodPace: {
      status: "on_track",
      baseDailyYen: 10_000,
      todayBonusYen: 0,
      adjustmentYen: 0,
      totalAdjustmentYen: 0,
      todayAllowanceYen: 10_000,
      usedTodayYen: 2_000,
      todayRemainingYen: 8_000,
    },
    dailyRows: [
      {
        date: "2026-07-12",
        label: "today",
        usedYen: 2_000,
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

describe("day-entry controller refresh failure", () => {
  it("finishes a successful save before reconciliation completes", async () => {
    const summary = createSummary();
    const refreshResponse = Promise.withResolvers<Response>();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(summary))
      .mockImplementationOnce(() => refreshResponse.promise);
    vi.stubGlobal("fetch", fetchMock);
    const controller = createDayEntryControllerState({
      getSelectedPeriodId: () => "period-1",
      getSummary: () => summary,
      historyController: {
        loadHistory: vi.fn(),
        loadHistoryEffect: () => Effect.void,
        resetHistories: vi.fn(),
      },
      setSummary: vi.fn(),
    });
    controller.openDayEntry({ date: "2026-07-12" });

    controller.submitDayEntry({
      date: "2026-07-12",
      inputYen: 2_000,
      memo: "committed without waiting",
    });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(controller.modalOpen).toBe(false);
    expect(controller.modalSaving).toBe(false);
    refreshResponse.resolve(jsonResponse(summary));
  });

  it("closes the modal after a successful save when summary refresh fails", async () => {
    const summary = createSummary();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(summary))
        .mockResolvedValueOnce(jsonResponse({ error: {} }, 503)),
    );
    const controller = createDayEntryControllerState({
      getSelectedPeriodId: () => "period-1",
      getSummary: () => summary,
      historyController: {
        loadHistory: vi.fn(),
        loadHistoryEffect: () => Effect.void,
        resetHistories: vi.fn(),
      },
      setSummary: vi.fn(),
    });
    controller.openDayEntry({ date: "2026-07-12" });

    controller.submitDayEntry({
      date: "2026-07-12",
      inputYen: 2_000,
      memo: "committed once",
    });

    await vi.waitFor(() => expect(controller.modalSaving).toBe(false));
    expect(controller.modalOpen).toBe(false);
  });
});
