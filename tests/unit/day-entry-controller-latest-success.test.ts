import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDayEntryControllerState } from "$lib/dashboard/day-entry-controller-state.svelte";
import type { PeriodSummary } from "$lib/dashboard/controller-types";

afterEach(() => {
  vi.unstubAllGlobals();
});

function createSummary(periodId: string, usedYen: number): PeriodSummary {
  return {
    periodId,
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

function createControllerState(
  getSelectedPeriodId: () => string,
  getSummary: () => PeriodSummary,
  setSummary: (summary: PeriodSummary) => void,
) {
  return createDayEntryControllerState({
    getSelectedPeriodId,
    getSummary,
    historyController: {
      loadHistory: vi.fn(),
      loadHistoryEffect: () => Effect.void,
      resetHistories: vi.fn(),
    },
    setSummary,
  });
}

describe("day-entry controller latest successful response", () => {
  it("tracks a same-period success while another period is selected", async () => {
    const olderResponse = Promise.withResolvers<Response>();
    const newerResponse = Promise.withResolvers<Response>();
    const olderSummary = createSummary("period-a", 2_000);
    const newerSummary = createSummary("period-a", 5_000);
    const periodBSummary = createSummary("period-b", 0);
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => olderResponse.promise)
      .mockImplementationOnce(() => newerResponse.promise)
      .mockResolvedValueOnce(jsonResponse({ error: {} }, 503));
    vi.stubGlobal("fetch", fetchMock);
    let selectedPeriodId = "period-a";
    let summary = createSummary("period-a", 0);
    const controller = createControllerState(
      () => selectedPeriodId,
      () => summary,
      (nextSummary) => {
        summary = nextSummary;
      },
    );

    controller.openDayEntry({ date: "2026-07-12" });
    controller.submitDayEntry({
      date: "2026-07-12",
      inputYen: 2_000,
      memo: "older",
    });
    controller.openDayEntry({ date: "2026-07-12" });
    controller.submitDayEntry({
      date: "2026-07-12",
      inputYen: 3_000,
      memo: "newer",
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    selectedPeriodId = "period-b";
    summary = periodBSummary;
    newerResponse.resolve(jsonResponse(newerSummary));
    await vi.waitFor(() => expect(controller.modalSaving).toBe(false));

    selectedPeriodId = "period-a";
    summary = newerSummary;
    olderResponse.resolve(jsonResponse(olderSummary));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    await vi.waitFor(() => expect(summary).toEqual(newerSummary));
  });

  it("does not update a reopened modal from a rejected stale response", async () => {
    const olderResponse = Promise.withResolvers<Response>();
    const olderSummary = createSummary("period-a", 2_000);
    const newerSummary = createSummary("period-a", 5_000);
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => olderResponse.promise)
      .mockResolvedValueOnce(jsonResponse(newerSummary))
      .mockResolvedValueOnce(jsonResponse({ error: {} }, 503));
    vi.stubGlobal("fetch", fetchMock);
    let summary = createSummary("period-a", 0);
    const controller = createControllerState(
      () => "period-a",
      () => summary,
      (nextSummary) => {
        summary = nextSummary;
      },
    );

    controller.openDayEntry({ date: "2026-07-12" });
    controller.submitDayEntry({
      date: "2026-07-12",
      inputYen: 2_000,
      memo: "older",
    });
    controller.openDayEntry({ date: "2026-07-12" });
    controller.submitDayEntry({
      date: "2026-07-12",
      inputYen: 3_000,
      memo: "newer",
    });
    await vi.waitFor(() => expect(summary).toEqual(newerSummary));
    await vi.waitFor(() => expect(controller.modalOpen).toBe(false));
    controller.openDayEntry({ date: "2026-07-12" });

    olderResponse.resolve(jsonResponse(olderSummary));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    await vi.waitFor(() => expect(controller.selectedRow?.usedYen).toBe(5_000));
  });
});
