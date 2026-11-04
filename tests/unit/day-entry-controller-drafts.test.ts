import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDayEntryControllerState } from "#lib/dashboard/day-entry-controller-state.svelte.ts";
import {
  createSummary,
  jsonResponse,
} from "./day-entry-controller-test-fixtures";

afterEach(() => vi.unstubAllGlobals());

function setup() {
  let periodId = "period-1";
  let summary = createSummary(0, 0);
  const response = Promise.withResolvers<Response>();
  const fetchMock = vi.fn(() => response.promise);
  vi.stubGlobal("fetch", fetchMock);
  const controller = createDayEntryControllerState({
    getSelectedPeriodId: () => periodId,
    getSummary: () => summary,
    historyController: {
      getMutationSequence: () => 0,
      loadHistory: vi.fn(),
      loadHistoryEffect: () => Effect.void,
      resetHistories: vi.fn(),
    },
    setSummary: (next) => {
      summary = next;
    },
  });
  return {
    controller,
    response,
    fetchMock,
    select: (id: string) => {
      periodId = id;
    },
  };
}

const date = "2026-07-12";

describe("day entry controller drafts", () => {
  it("restores cancelled drafts and isolates dates and periods", () => {
    const { controller: c, select } = setup();
    c.openDayEntry({ date });
    c.modalInputYen = "1e3";
    c.modalMemo = "未送信";
    c.closeDayEntry();
    c.openDayEntry({ date: "2026-07-13" });
    expect(c.modalInputYen).toBe("");
    c.closeDayEntry();
    select("period-2");
    c.openDayEntry({ date });
    expect(c.modalMemo).toBe("");
    c.closeDayEntry();
    select("period-1");
    c.openDayEntry({ date });
    expect(c.modalInputYen).toBe("1e3");
    expect(c.modalMemo).toBe("未送信");
  });

  for (const newerEdit of [false, true]) {
    it(`clears only the submitted version on success (newer edit: ${newerEdit})`, async () => {
      const { controller: c, response, fetchMock } = setup();
      c.openDayEntry({ date });
      c.modalInputYen = "800";
      c.modalMemo = "送信内容";
      c.submitDayEntry({ date, inputYen: 800, memo: c.modalMemo });
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      if (newerEdit) {
        c.modalInputYen = "500";
        c.modalMemo = "次の入力";
      }
      response.resolve(jsonResponse(createSummary(800, 0)));
      await vi.waitFor(() => expect(c.modalOpen).toBe(false));
      c.openDayEntry({ date });
      expect(c.modalInputYen).toBe(newerEdit ? "500" : "");
      expect(c.modalMemo).toBe(newerEdit ? "次の入力" : "");
    });
  }

  it("does not clear a reopened session's new draft after stale success", async () => {
    const { controller: c, response, fetchMock } = setup();
    c.openDayEntry({ date });
    c.modalInputYen = "800";
    c.submitDayEntry({ date, inputYen: 800, memo: "" });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    c.closeDayEntry();
    c.openDayEntry({ date });
    c.modalInputYen = "900";
    response.resolve(jsonResponse(createSummary(800, 0)));
    await vi.waitFor(() => expect(c.selectedRow?.usedYen).toBe(800));
    expect(c.modalOpen).toBe(true);
    c.closeDayEntry();
    c.openDayEntry({ date });
    expect(c.modalInputYen).toBe("900");
  });

  it("retains the draft after a rejected save", async () => {
    const { controller: c, response, fetchMock } = setup();
    c.openDayEntry({ date });
    c.modalInputYen = "800";
    c.modalMemo = "再試行";
    c.submitDayEntry({ date, inputYen: 800, memo: c.modalMemo });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    response.resolve(jsonResponse({ error: "失敗" }, 400));
    await vi.waitFor(() => expect(c.modalSaving).toBe(false));
    c.closeDayEntry();
    c.openDayEntry({ date });
    expect(c.modalInputYen).toBe("800");
    expect(c.modalMemo).toBe("再試行");
  });
});
