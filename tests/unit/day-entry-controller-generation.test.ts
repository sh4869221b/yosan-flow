import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDayEntryControllerState } from "$lib/dashboard/day-entry-controller-state.svelte";
import type { PeriodSummary } from "$lib/dashboard/controller-types";

afterEach(() => {
  vi.unstubAllGlobals();
});

function createSummary(
  firstDateUsedYen: number,
  secondDateUsedYen: number,
): PeriodSummary {
  return {
    periodId: "period-1",
    startDate: "2026-07-12",
    endDate: "2026-07-13",
    budgetYen: 10_000,
    status: "active",
    periodLengthDays: 2,
    spentToDateYen: firstDateUsedYen + secondDateUsedYen,
    plannedTotalYen: firstDateUsedYen + secondDateUsedYen,
    remainingYen: 10_000 - firstDateUsedYen - secondDateUsedYen,
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
      usedTodayYen: firstDateUsedYen,
      todayRemainingYen: 5_000 - firstDateUsedYen,
    },
    dailyRows: [
      {
        date: "2026-07-12",
        label: "today",
        usedYen: firstDateUsedYen,
        recommendedYen: 5_000,
      },
      {
        date: "2026-07-13",
        label: "planned",
        usedYen: secondDateUsedYen,
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

describe("day-entry controller modal generation", () => {
  it("keeps the current modal session usable when its save fails", async () => {
    // Given
    const initialSummary = createSummary(0, 0);
    let summary = initialSummary;
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({ error: { message: "current error" } }, 503),
        ),
      ),
    );
    const controller = createDayEntryControllerState({
      getSelectedPeriodId: () => "period-1",
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
    controller.modalInputYen = "2000";
    controller.modalMemo = "current session";

    // When
    controller.submitDayEntry({
      date: "2026-07-12",
      inputYen: 2_000,
      memo: "current session",
    });

    // Then
    await vi.waitFor(() => {
      expect(controller.modalError).toBe("current error");
      expect(controller.modalSaving).toBe(false);
    });
    expect(controller.modalOpen).toBe(true);
    expect(controller.selectedDate).toBe("2026-07-12");
    expect(controller.modalInputYen).toBe("2000");
    expect(controller.modalMemo).toBe("current session");
    expect(summary).toEqual(initialSummary);
  });

  it("applies an old save summary without mutating a newer modal session", async () => {
    // Given
    const initialSummary = createSummary(0, 0);
    const returnedSummary = createSummary(2_000, 0);
    let summary = initialSummary;
    const historyDates: string[] = [];
    const historyBarrier = Promise.withResolvers<void>();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(jsonResponse(returnedSummary))),
    );
    const controller = createDayEntryControllerState({
      getSelectedPeriodId: () => "period-1",
      getSummary: () => summary,
      historyController: {
        loadHistory: vi.fn(),
        loadHistoryEffect: (date) =>
          Effect.promise(async () => {
            historyDates.push(date);
            await historyBarrier.promise;
          }),
        resetHistories: vi.fn(),
      },
      setSummary: (nextSummary) => {
        summary = nextSummary;
      },
    });
    controller.openDayEntry({ date: "2026-07-12" });

    // When
    controller.submitDayEntry({
      date: "2026-07-12",
      inputYen: 2_000,
      memo: "old session",
    });
    await vi.waitFor(() => {
      expect(summary).toEqual(returnedSummary);
      expect(historyDates).toEqual(["2026-07-12"]);
    });
    controller.openDayEntry({ date: "2026-07-13" });

    // Then
    expect(controller.modalSaving).toBe(false);
    expect(controller.modalOpen).toBe(true);
    expect(controller.selectedDate).toBe("2026-07-13");
    expect(controller.selectedRow?.usedYen).toBe(0);
    historyBarrier.resolve();
    await vi.waitFor(() => {
      expect(controller.modalOpen).toBe(true);
      expect(controller.selectedDate).toBe("2026-07-13");
      expect(controller.selectedRow?.usedYen).toBe(0);
      expect(controller.modalSaving).toBe(false);
      expect(controller.modalError).toBeNull();
    });
  });

  it("does not publish an old save failure into a newer modal session", async () => {
    // Given
    const failedResponse = Promise.withResolvers<Response>();
    let summary = createSummary(0, 0);
    vi.stubGlobal(
      "fetch",
      vi.fn(() => failedResponse.promise),
    );
    const controller = createDayEntryControllerState({
      getSelectedPeriodId: () => "period-1",
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
      memo: "old session",
    });
    await vi.waitFor(() => {
      expect(controller.modalSaving).toBe(true);
    });

    // When
    controller.openDayEntry({ date: "2026-07-13" });
    failedResponse.resolve(
      jsonResponse({ error: { message: "old error" } }, 503),
    );

    // Then
    await vi.waitFor(() => {
      expect(controller.modalOpen).toBe(true);
      expect(controller.selectedDate).toBe("2026-07-13");
      expect(controller.modalSaving).toBe(false);
      expect(controller.modalError).toBeNull();
    });
  });
});
