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

function createSequencedSubmissionHarness() {
  const firstResponse = Promise.withResolvers<Response>();
  const secondResponse = Promise.withResolvers<Response>();
  const publishedSummaries: PeriodSummary[] = [];
  const loadHistoryEffect = vi.fn(() => Effect.void);
  const fetchMock = vi
    .fn()
    .mockImplementationOnce(() => firstResponse.promise)
    .mockImplementationOnce(() => secondResponse.promise);
  let summary = createSummary(0, 0);
  vi.stubGlobal("fetch", fetchMock);
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
      publishedSummaries.push(nextSummary);
    },
  });

  return {
    controller,
    fetchMock,
    firstResponse,
    loadHistoryEffect,
    publishedSummaries,
    secondResponse,
    get summary() {
      return summary;
    },
  };
}

async function submitTwoDayEntries(
  harness: ReturnType<typeof createSequencedSubmissionHarness>,
  openNewModalSession = false,
): Promise<void> {
  harness.controller.openDayEntry({ date: "2026-07-12" });
  harness.controller.submitDayEntry({
    date: "2026-07-12",
    inputYen: 2_000,
    memo: "first",
  });
  await vi.waitFor(() => {
    expect(harness.fetchMock).toHaveBeenCalledTimes(1);
  });
  if (openNewModalSession) {
    harness.controller.openDayEntry({ date: "2026-07-13" });
  }
  harness.controller.submitDayEntry({
    date: "2026-07-13",
    inputYen: 3_000,
    memo: "second",
  });
  await vi.waitFor(() => {
    expect(harness.fetchMock).toHaveBeenCalledTimes(2);
  });
}

describe("day-entry controller modal generation", () => {
  it("keeps the newest state and refreshes history after a stale save completes", async () => {
    // Given
    const firstSummary = createSummary(2_000, 0);
    const secondSummary = createSummary(2_000, 3_000);
    const harness = createSequencedSubmissionHarness();
    await submitTwoDayEntries(harness);

    // When
    harness.secondResponse.resolve(jsonResponse(secondSummary));
    await vi.waitFor(() => {
      expect(harness.summary).toEqual(secondSummary);
      expect(harness.loadHistoryEffect).toHaveBeenCalledTimes(1);
    });
    harness.firstResponse.resolve(jsonResponse(firstSummary));

    // Then
    await vi.waitFor(() => {
      expect(harness.loadHistoryEffect).toHaveBeenCalledTimes(2);
      expect(harness.publishedSummaries).toEqual([secondSummary]);
    });
    expect(harness.summary).toEqual(secondSummary);
  });

  it("applies an older successful summary when the newer submission fails", async () => {
    // Given
    const firstSummary = createSummary(2_000, 0);
    const harness = createSequencedSubmissionHarness();
    await submitTwoDayEntries(harness, true);

    // When
    harness.secondResponse.resolve(
      jsonResponse({ error: { message: "newer failed" } }, 503),
    );
    await vi.waitFor(() => {
      expect(harness.controller.modalError).toBe("newer failed");
    });
    harness.firstResponse.resolve(jsonResponse(firstSummary));

    // Then
    await vi.waitFor(() => {
      expect(harness.summary).toEqual(firstSummary);
    });
  });

  it("applies successful summaries in normal submission order", async () => {
    // Given
    const firstSummary = createSummary(2_000, 0);
    const secondSummary = createSummary(2_000, 3_000);
    const harness = createSequencedSubmissionHarness();
    await submitTwoDayEntries(harness, true);

    // When
    harness.firstResponse.resolve(jsonResponse(firstSummary));
    await vi.waitFor(() => {
      expect(harness.summary).toEqual(firstSummary);
    });
    harness.secondResponse.resolve(jsonResponse(secondSummary));

    // Then
    await vi.waitFor(() => {
      expect(harness.summary).toEqual(secondSummary);
    });
    expect(harness.publishedSummaries).toEqual([firstSummary, secondSummary]);
  });

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
    const successfulResponse = Promise.withResolvers<Response>();
    let summary = initialSummary;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => successfulResponse.promise),
    );
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

    // When
    controller.submitDayEntry({
      date: "2026-07-12",
      inputYen: 2_000,
      memo: "old session",
    });
    await vi.waitFor(() => {
      expect(controller.modalSaving).toBe(true);
    });
    controller.openDayEntry({ date: "2026-07-13" });
    successfulResponse.resolve(jsonResponse(returnedSummary));

    // Then
    await vi.waitFor(() => {
      expect(summary).toEqual(returnedSummary);
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
