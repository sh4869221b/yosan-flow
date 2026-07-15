import { Effect, Fiber } from "effect";
import { afterEach, expect, it, vi } from "vitest";
import { createHistoryControllerState } from "$lib/dashboard/history-controller-state.svelte";
import type { HistoryItem } from "$lib/dashboard/types";
import {
  createSummary,
  jsonResponse,
} from "./day-entry-controller-test-fixtures";

afterEach(() => vi.unstubAllGlobals());

function createHistory(id: string, date: string): HistoryItem {
  return {
    id,
    date,
    operationType: "add",
    inputYen: 500,
    beforeTotalYen: 0,
    afterTotalYen: 500,
    memo: id,
    createdAt: "2026-07-12T00:00:00.000Z",
  };
}

it.each(["PATCH", "DELETE"] as const)(
  "restores an off-screen successful %s body before a slow history reload",
  async (method) => {
    const firstDate = "2026-07-12";
    const secondDate = "2026-07-13";
    const committedHistory = createHistory("COMMITTED", firstDate);
    const secondDateHistory = createHistory("SECOND_DATE", secondDate);
    let selectedDate = firstDate;
    let mutationResponseResolve: (_response: Response) => void = () =>
      undefined;
    const mutationResponse = new Promise<Response>((resolve) => {
      mutationResponseResolve = resolve;
    });
    let slowReloadResolve: (_response: Response) => void = () => undefined;
    const slowReload = new Promise<Response>((resolve) => {
      slowReloadResolve = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => mutationResponse)
      .mockResolvedValueOnce(jsonResponse({ histories: [secondDateHistory] }))
      .mockImplementationOnce(() => slowReload);
    vi.stubGlobal("fetch", fetchMock);
    const controller = createHistoryControllerState({
      getSelectedDate: () => selectedDate,
      getSelectedPeriodId: () => "period-1",
      getSummary: () => createSummary(0),
      setSelectedRow: vi.fn(),
      setSummary: vi.fn(),
    });

    if (method === "PATCH") {
      controller.updateHistory({
        historyId: "history-1",
        inputYen: 500,
        memo: "committed",
      });
    } else {
      controller.deleteHistory({ historyId: "history-1" });
    }
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    selectedDate = secondDate;
    await Effect.runPromise(controller.loadHistoryEffect(secondDate));
    mutationResponseResolve(
      jsonResponse({
        summary: createSummary(500),
        histories: [committedHistory],
      }),
    );
    await vi.waitFor(() => expect(controller.historyMutatingId).toBeNull());
    expect(controller.histories).toEqual([secondDateHistory]);

    selectedDate = firstDate;
    const reload = Effect.runFork(controller.loadHistoryEffect(firstDate));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    expect(controller.histories).toEqual([committedHistory]);
    slowReloadResolve(jsonResponse({ error: {} }, 503));
    await Effect.runPromise(Fiber.join(reload));
    expect(controller.histories).toEqual([committedHistory]);
  },
);
