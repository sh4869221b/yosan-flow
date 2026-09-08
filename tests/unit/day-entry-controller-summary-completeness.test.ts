import { Effect } from "effect";
import { afterEach, expect, it, vi } from "vitest";
import { createDayEntryControllerState } from "$lib/dashboard/day-entry-controller-state.svelte";
import {
  createSummary,
  jsonResponse,
} from "./day-entry-controller-test-fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

it("applies an off-screen successful body after returning to its period", async () => {
  const firstResponse = Promise.withResolvers<Response>();
  const secondResponse = Promise.withResolvers<Response>();
  const committedSummary = createSummary(2_000);
  const periodBSummary = { ...createSummary(0), periodId: "period-2" };
  const fetchMock = vi
    .fn()
    .mockImplementationOnce(() => firstResponse.promise)
    .mockImplementationOnce(() => secondResponse.promise)
    .mockResolvedValueOnce(jsonResponse({ error: {} }, 503));
  vi.stubGlobal("fetch", fetchMock);
  let selectedPeriodId = "period-1";
  let summary = createSummary(0);
  const controller = createDayEntryControllerState({
    getSelectedPeriodId: () => selectedPeriodId,
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
    memo: "committed",
  });
  controller.submitDayEntry({
    date: "2026-07-13",
    inputYen: 3_000,
    memo: "failed",
  });
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

  selectedPeriodId = "period-2";
  summary = periodBSummary;
  firstResponse.resolve(jsonResponse(committedSummary));
  await vi.waitFor(() => expect(controller.modalOpen).toBe(false));
  expect(summary).toEqual(periodBSummary);
  selectedPeriodId = "period-1";
  summary = createSummary(0);
  secondResponse.resolve(jsonResponse({ error: {} }, 503));

  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  await vi.waitFor(() => expect(summary).toEqual(committedSummary));
});

it("does not replace a newer current summary with an off-screen candidate", async () => {
  const successfulResponse = Promise.withResolvers<Response>();
  const failedResponse = Promise.withResolvers<Response>();
  const retainedSummary = createSummary(2_000);
  const newerSummary = createSummary(2_000, 3_000);
  const periodBSummary = { ...createSummary(0), periodId: "period-2" };
  const fetchMock = vi
    .fn()
    .mockImplementationOnce(() => successfulResponse.promise)
    .mockImplementationOnce(() => failedResponse.promise)
    .mockResolvedValueOnce(jsonResponse({ error: {} }, 503));
  vi.stubGlobal("fetch", fetchMock);
  let selectedPeriodId = "period-1";
  let summary = createSummary(0);
  const controller = createDayEntryControllerState({
    getSelectedPeriodId: () => selectedPeriodId,
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
  controller.submitDayEntry({
    date: "2026-07-12",
    inputYen: 2_000,
    memo: "committed",
  });
  controller.submitDayEntry({
    date: "2026-07-13",
    inputYen: 3_000,
    memo: "failed",
  });
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

  selectedPeriodId = "period-2";
  summary = periodBSummary;
  successfulResponse.resolve(jsonResponse(retainedSummary));
  await vi.waitFor(() => expect(controller.modalSaving).toBe(false));
  selectedPeriodId = "period-1";
  summary = newerSummary;
  failedResponse.resolve(jsonResponse({ error: {} }, 503));

  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  await vi.waitFor(() => expect(summary).toEqual(newerSummary));
});
