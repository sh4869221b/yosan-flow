import { afterEach, describe, expect, it, vi } from "vitest";
import { createHistoryControllerState } from "$lib/dashboard/history-controller-state.svelte";
import type { PeriodSummary } from "$lib/dashboard/controller-types";
import type { HistoryItem } from "$lib/dashboard/types";
import {
  createSummary,
  jsonResponse,
} from "./day-entry-controller-test-fixtures";

afterEach(() => vi.unstubAllGlobals());

const date = "2026-07-12";
const history: HistoryItem = {
  id: "history-1",
  date,
  operationType: "add",
  inputYen: 500,
  beforeTotalYen: 0,
  afterTotalYen: 500,
  memo: "昼食",
  createdAt: "2026-07-12T03:00:00.000Z",
};

function createController(getSelectedDate: () => string | null = () => date) {
  let summary: PeriodSummary = createSummary(0);
  return createHistoryControllerState({
    getSelectedDate,
    getSelectedPeriodId: () => "period-1",
    getSummary: () => summary,
    setSelectedRow: vi.fn(),
    setSummary: (nextSummary) => {
      summary = nextSummary;
    },
  });
}

describe("history controller presentation outcomes", () => {
  it("returns success only when the requested history is published", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ histories: [history] })),
    );
    const controller = createController();

    const result = await controller.retryHistory(date);

    expect(result).toEqual({ kind: "success" });
    expect(controller.histories).toEqual([history]);
  });

  it("returns ignored when an older retry settles after the selected date changes", async () => {
    const response = Promise.withResolvers<Response>();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => response.promise),
    );
    let selectedDate = date;
    const controller = createController(() => selectedDate);

    const resultPromise = controller.retryHistory(date);
    selectedDate = "2026-07-13";
    response.resolve(jsonResponse({ histories: [history] }));

    await expect(resultPromise).resolves.toEqual({ kind: "ignored" });
    expect(controller.histories).toEqual([]);
  });

  it("keeps published histories while a background load is pending", async () => {
    const pendingResponse = Promise.withResolvers<Response>();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ histories: [history] }))
      .mockImplementationOnce(() => pendingResponse.promise);
    vi.stubGlobal("fetch", fetchMock);
    const controller = createController();
    await controller.retryHistory(date);

    const refresh = controller.retryHistory(date);

    expect(controller.histories).toEqual([history]);
    pendingResponse.resolve(jsonResponse({ histories: [] }));
    await expect(refresh).resolves.toEqual({ kind: "success" });
  });

  it.each([0, 500])(
    "returns success for a direct accepted update from %i yen",
    async (initialUsedYen) => {
      const committedSummary = createSummary(500);
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          jsonResponse({
            summary: committedSummary,
            histories: [history],
          }),
        ),
      );
      let summary: PeriodSummary = createSummary(initialUsedYen);
      const controller = createHistoryControllerState({
        getSelectedDate: () => date,
        getSelectedPeriodId: () => "period-1",
        getSummary: () => summary,
        setSelectedRow: vi.fn(),
        setSummary: (nextSummary) => {
          summary = nextSummary;
        },
      });

      const result = await controller.updateHistory({
        historyId: history.id,
        inputYen: 500,
        memo: history.memo ?? "",
      });

      expect(result).toEqual({ kind: "success" });
      expect(controller.histories).toEqual([history]);
    },
  );

  it("returns success after an accepted mutation is reconciled", async () => {
    const incompatibleResponse = {
      ...createSummary(500),
      budgetYen: 20_000,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ summary: incompatibleResponse, histories: [history] }),
      )
      .mockResolvedValueOnce(jsonResponse(createSummary(500)))
      .mockResolvedValueOnce(jsonResponse({ histories: [history] }));
    vi.stubGlobal("fetch", fetchMock);
    const controller = createController();

    const result = await controller.updateHistory({
      historyId: history.id,
      inputYen: 500,
      memo: history.memo ?? "",
    });

    expect(result).toEqual({ kind: "success" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("keeps the originating mutation failure after recovery succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: {} }, 503))
      .mockResolvedValueOnce(jsonResponse(createSummary(0)))
      .mockResolvedValueOnce(jsonResponse({ histories: [history] }));
    vi.stubGlobal("fetch", fetchMock);
    const controller = createController();

    const result = await controller.updateHistory({
      historyId: history.id,
      inputYen: 500,
      memo: history.memo ?? "",
    });

    expect(result).toEqual({
      kind: "failure",
      message: "履歴の更新に失敗しました。",
    });
    expect(controller.historyError).toBe("履歴の更新に失敗しました。");
  });
});
