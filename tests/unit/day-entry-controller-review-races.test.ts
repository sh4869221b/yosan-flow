import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDayEntryControllerState } from "$lib/dashboard/day-entry-controller-state.svelte";
import type { PeriodSummary } from "$lib/dashboard/controller-types";

afterEach(() => {
  vi.unstubAllGlobals();
});

function createSummary(firstUsedYen: number, secondUsedYen = 0): PeriodSummary {
  return {
    periodId: "period-1",
    startDate: "2026-07-12",
    endDate: "2026-07-13",
    budgetYen: 10_000,
    status: "active",
    periodLengthDays: 2,
    spentToDateYen: firstUsedYen + secondUsedYen,
    plannedTotalYen: firstUsedYen + secondUsedYen,
    remainingYen: 10_000 - firstUsedYen - secondUsedYen,
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

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

describe("day-entry controller review races", () => {
  it("refreshes the authoritative summary after concurrent saves settle", async () => {
    const firstResponse = Promise.withResolvers<Response>();
    const secondResponse = Promise.withResolvers<Response>();
    const partialSummary = createSummary(0, 3_000);
    const combinedSummary = createSummary(2_000, 3_000);
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => firstResponse.promise)
      .mockImplementationOnce(() => secondResponse.promise)
      .mockResolvedValueOnce(jsonResponse(combinedSummary));
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

    secondResponse.resolve(jsonResponse(partialSummary));
    firstResponse.resolve(jsonResponse(combinedSummary));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/periods/period-1",
      undefined,
    );
    await vi.waitFor(() => expect(summary).toEqual(combinedSummary));
  });

  it("refreshes history when the submitted date is reopened before save completion", async () => {
    const saveResponse = Promise.withResolvers<Response>();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementationOnce(() => saveResponse.promise)
        .mockResolvedValueOnce(jsonResponse(createSummary(2_000))),
    );
    let summary = createSummary(0);
    const loadHistoryEffect = vi.fn(() => Effect.void);
    const controller = createDayEntryControllerState({
      getSelectedPeriodId: () => "period-1",
      getSummary: () => summary,
      historyController: {
        getMutationSequence: () => 0,
        loadHistory: vi.fn(),
        loadHistoryEffect,
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
      memo: "old",
    });
    controller.openDayEntry({ date: "2026-07-12" });
    controller.modalInputYen = "3000";
    saveResponse.resolve(jsonResponse(createSummary(2_000)));

    await vi.waitFor(() => expect(loadHistoryEffect).toHaveBeenCalledTimes(1));
    expect(controller.modalOpen).toBe(true);
    expect(controller.selectedRow?.usedYen).toBe(2_000);
    expect(controller.modalInputYen).toBe("3000");
  });

  it("does not refresh an old date after summary reconciliation", async () => {
    // Given
    const summary = createSummary(2_000);
    const refreshResponse = Promise.withResolvers<Response>();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(summary))
      .mockImplementationOnce(() => refreshResponse.promise);
    vi.stubGlobal("fetch", fetchMock);
    const loadHistoryEffect = vi.fn(() => Effect.void);
    const setSummary = vi.fn();
    const controller = createDayEntryControllerState({
      getSelectedPeriodId: () => "period-1",
      getSummary: () => summary,
      historyController: {
        getMutationSequence: () => 0,
        loadHistory: vi.fn(),
        loadHistoryEffect,
        resetHistories: vi.fn(),
      },
      setSummary,
    });
    controller.openDayEntry({ date: "2026-07-12" });
    controller.submitDayEntry({
      date: "2026-07-12",
      inputYen: 2_000,
      memo: "old date",
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    // When
    controller.openDayEntry({ date: "2026-07-13" });
    refreshResponse.resolve(jsonResponse(summary));

    // Then
    await vi.waitFor(() => expect(setSummary).toHaveBeenCalledTimes(2));
    expect(loadHistoryEffect).not.toHaveBeenCalled();
  });

  it("does not apply an older authoritative refresh after a newer save", async () => {
    const firstRefresh = Promise.withResolvers<Response>();
    const firstSummary = createSummary(2_000);
    const secondSummary = createSummary(5_000);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(firstSummary))
      .mockImplementationOnce(() => firstRefresh.promise)
      .mockResolvedValueOnce(jsonResponse(secondSummary))
      .mockResolvedValueOnce(jsonResponse(secondSummary));
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
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    controller.openDayEntry({ date: "2026-07-12" });
    controller.submitDayEntry({
      date: "2026-07-12",
      inputYen: 3_000,
      memo: "second",
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    await vi.waitFor(() => expect(summary).toEqual(secondSummary));

    firstRefresh.resolve(jsonResponse(firstSummary));

    await vi.waitFor(() => expect(summary).toEqual(secondSummary));
  });

  it("does not apply save state after the selected period changes", async () => {
    const saveResponse = Promise.withResolvers<Response>();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementationOnce(() => saveResponse.promise)
        .mockResolvedValueOnce(jsonResponse(createSummary(2_000))),
    );
    let selectedPeriodId = "period-1";
    const periodTwoSummary = { ...createSummary(0), periodId: "period-2" };
    let summary = periodTwoSummary;
    const loadHistoryEffect = vi.fn(() => Effect.void);
    const controller = createDayEntryControllerState({
      getSelectedPeriodId: () => selectedPeriodId,
      getSummary: () => summary,
      historyController: {
        getMutationSequence: () => 0,
        loadHistory: vi.fn(),
        loadHistoryEffect,
        resetHistories: vi.fn(),
      },
      setSummary: (nextSummary) => {
        summary = nextSummary;
      },
    });

    summary = createSummary(0);
    controller.openDayEntry({ date: "2026-07-12" });
    controller.submitDayEntry({
      date: "2026-07-12",
      inputYen: 2_000,
      memo: "old period",
    });
    selectedPeriodId = "period-2";
    summary = periodTwoSummary;
    saveResponse.resolve(jsonResponse(createSummary(2_000)));

    await vi.waitFor(() => expect(summary).toEqual(periodTwoSummary));
    expect(loadHistoryEffect).not.toHaveBeenCalled();
  });
});
