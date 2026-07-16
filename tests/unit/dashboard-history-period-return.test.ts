import { afterEach, expect, it, vi } from "vitest";
import { createDashboardPageController } from "$lib/dashboard/page-controller.svelte";
import type {
  PeriodOption,
  PeriodSummary,
} from "$lib/dashboard/controller-types";
import type { HistoryItem } from "$lib/dashboard/types";
import {
  createSummary,
  jsonResponse,
} from "./day-entry-controller-test-fixtures";

afterEach(() => vi.unstubAllGlobals());

const date = "2026-07-12";
const periodA: PeriodOption = {
  id: "period-a",
  startDate: date,
  endDate: "2026-07-13",
  budgetYen: 10_000,
  status: "active",
  predecessorPeriodId: null,
  createdAt: "2026-07-12T00:00:00.000Z",
  updatedAt: "2026-07-12T00:00:00.000Z",
};
const periodB: PeriodOption = {
  ...periodA,
  id: "period-b",
  status: "closed",
};

function forPeriod(summary: PeriodSummary, periodId: string): PeriodSummary {
  return { ...summary, periodId };
}

function createHistory(id: string, inputYen: number): HistoryItem {
  return {
    id,
    date,
    operationType: "add",
    inputYen,
    beforeTotalYen: 0,
    afterTotalYen: inputYen,
    memo: id,
    createdAt: "2026-07-12T00:00:00.000Z",
  };
}

it.each(["PATCH", "DELETE"] as const)(
  "keeps a retained %s body after returning to its period and publishing its summary",
  async (method) => {
    const initialHistory = createHistory("history-1", 500);
    const remainingHistory = createHistory("history-2", 250);
    const initialHistories = [initialHistory, remainingHistory];
    const committedHistories =
      method === "PATCH"
        ? [createHistory("history-1", 750), remainingHistory]
        : [remainingHistory];
    const initialSummary = forPeriod(createSummary(750), periodA.id);
    const committedSummary = forPeriod(
      createSummary(method === "PATCH" ? 1_000 : 250),
      periodA.id,
    );
    const periodBSummary = forPeriod(createSummary(0), periodB.id);
    const mutationResponse = Promise.withResolvers<Response>();
    const failedHistoryReload = Promise.withResolvers<Response>();
    let historyGetCount = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const requestMethod = init?.method ?? "GET";
      if (requestMethod === "GET" && url.endsWith(`/days/${date}/history`)) {
        historyGetCount += 1;
        return historyGetCount === 1
          ? Promise.resolve(jsonResponse({ histories: initialHistories }))
          : failedHistoryReload.promise;
      }
      if (requestMethod === method && url.endsWith("/history/history-1")) {
        return mutationResponse.promise;
      }
      if (requestMethod === "GET" && url === `/api/periods/${periodB.id}`) {
        return Promise.resolve(jsonResponse(periodBSummary));
      }
      if (requestMethod === "GET" && url === `/api/periods/${periodA.id}`) {
        return Promise.resolve(jsonResponse(committedSummary));
      }
      throw new Error(`Unexpected fetch: ${requestMethod} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const controller = createDashboardPageController(() => ({
      today: date,
      periods: [periodA, periodB],
      selectedPeriodId: periodA.id,
      summary: initialSummary,
    }));

    controller.openDayEntry({ date });
    await vi.waitFor(() =>
      expect(controller.histories).toEqual(initialHistories),
    );
    if (method === "PATCH") {
      controller.updateHistory({
        historyId: initialHistory.id,
        inputYen: 750,
        memo: "updated",
      });
    } else {
      controller.deleteHistory({ historyId: initialHistory.id });
    }
    await vi.waitFor(() =>
      expect(controller.historyMutatingId).toBe("history-1"),
    );
    controller.handleSelectPeriod({ periodId: periodB.id });
    await vi.waitFor(() =>
      expect(controller.selectedPeriodId).toBe(periodB.id),
    );

    mutationResponse.resolve(
      jsonResponse({
        summary: committedSummary,
        histories: committedHistories,
      }),
    );
    await vi.waitFor(() => expect(controller.historyMutatingId).toBeNull());
    controller.handleSelectPeriod({ periodId: periodA.id });
    await vi.waitFor(() =>
      expect(controller.selectedPeriodId).toBe(periodA.id),
    );
    controller.openDayEntry({ date });
    await vi.waitFor(() => expect(historyGetCount).toBe(2));

    expect(controller.histories).toEqual(committedHistories);
    failedHistoryReload.resolve(jsonResponse({ error: {} }, 503));
    await vi.waitFor(() => expect(controller.historyLoading).toBe(false));
    expect(controller.histories).toEqual(committedHistories);
  },
);
