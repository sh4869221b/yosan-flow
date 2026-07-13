import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

describe("dashboard history mutation races", () => {
  it("does not let add reconciliation overwrite a later history mutation", async () => {
    const staleSummary = createSummary(2_000);
    const editedSummary = createSummary(1_000);
    const staleRefresh = Promise.withResolvers<Response>();
    const originalHistory = createHistory("history-1", 2_000);
    const editedHistory = createHistory("history-1", 1_000);
    let currentHistories = [originalHistory];
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (method === "POST" && url.endsWith("/add")) {
        return Promise.resolve(jsonResponse(staleSummary));
      }
      if (method === "GET" && url === "/api/periods/period-1") {
        return staleRefresh.promise;
      }
      if (method === "GET" && url.endsWith("/history")) {
        return Promise.resolve(jsonResponse({ histories: currentHistories }));
      }
      if (method === "PATCH") {
        currentHistories = [editedHistory];
        return Promise.resolve(
          jsonResponse({ summary: editedSummary, histories: currentHistories }),
        );
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    let summary = createSummary(0);
    const dayEntryControllerRef: {
      current: ReturnType<typeof createDayEntryControllerState> | null;
    } = { current: null };
    const historyController = createHistoryControllerState({
      getSelectedDate: () =>
        dayEntryControllerRef.current?.selectedDate ?? null,
      getSelectedPeriodId: () => "period-1",
      setSelectedRow: (row) =>
        dayEntryControllerRef.current?.setSelectedRow(row),
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

    dayEntryController.submitDayEntry({
      date: "2026-07-12",
      inputYen: 2_000,
      memo: "saved",
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    dayEntryController.openDayEntry({ date: "2026-07-12" });
    await vi.waitFor(() =>
      expect(historyController.histories).toEqual([originalHistory]),
    );
    historyController.updateHistory({
      historyId: "history-1",
      inputYen: 1_000,
      memo: "edited",
    });
    await vi.waitFor(() => expect(summary).toEqual(editedSummary));

    staleRefresh.resolve(jsonResponse(staleSummary));
    await vi.waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([input]) =>
          String(input).endsWith("/history"),
        ),
      ).toHaveLength(2),
    );

    expect(summary).toEqual(editedSummary);
    expect(dayEntryController.selectedRow?.usedYen).toBe(1_000);
  });

  it("does not let an older history load overwrite a later mutation", async () => {
    const staleLoad = Promise.withResolvers<Response>();
    const oldHistory = createHistory("history-1", 2_000);
    const editedHistory = createHistory("history-1", 1_000);
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => staleLoad.promise)
      .mockResolvedValueOnce(
        jsonResponse({
          summary: createSummary(1_000),
          histories: [editedHistory],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const controller = createHistoryControllerState({
      getSelectedDate: () => "2026-07-12",
      getSelectedPeriodId: () => "period-1",
      setSelectedRow: vi.fn(),
      setSummary: vi.fn(),
    });

    const loading = Effect.runPromise(
      controller.loadHistoryEffect("2026-07-12"),
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    controller.updateHistory({
      historyId: "history-1",
      inputYen: 1_000,
      memo: "edited",
    });
    await vi.waitFor(() =>
      expect(controller.histories).toEqual([editedHistory]),
    );
    staleLoad.resolve(jsonResponse({ histories: [oldHistory] }));
    await loading;

    expect(controller.histories).toEqual([editedHistory]);
  });
});
