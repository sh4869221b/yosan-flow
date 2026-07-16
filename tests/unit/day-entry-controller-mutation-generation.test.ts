import { Effect } from "effect";
import { afterEach, expect, it, vi } from "vitest";
import { createDayEntryControllerState } from "$lib/dashboard/day-entry-controller-state.svelte";
import { createPeriodSummaryRevision } from "$lib/dashboard/period-summary-revision";
import {
  createSummary,
  jsonResponse,
} from "./day-entry-controller-test-fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

it("starts a new add generation after a cross-kind mutation", async () => {
  const oldAddResponse = Promise.withResolvers<Response>();
  const initialSummary = createSummary(0);
  const oldAddSummary = createSummary(1_000);
  const latestAddSummary = createSummary(3_000);
  let addCount = 0;
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method === "POST" && url.endsWith("/add")) {
      addCount += 1;
      return addCount === 1
        ? oldAddResponse.promise
        : Promise.resolve(jsonResponse(latestAddSummary));
    }
    if (method === "GET" && url === "/api/periods/period-1") {
      return Promise.resolve(jsonResponse({ error: {} }, 503));
    }
    throw new Error(`Unexpected fetch: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  const summaryRevision = createPeriodSummaryRevision();
  let summary = initialSummary;
  const controller = createDayEntryControllerState(
    {
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
    },
    summaryRevision,
  );

  controller.openDayEntry({ date: "2026-07-12" });
  controller.submitDayEntry({
    date: "2026-07-12",
    inputYen: 1_000,
    memo: "old add",
  });
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

  summaryRevision.beginMutation("period-1");
  controller.openDayEntry({ date: "2026-07-13" });
  controller.submitDayEntry({
    date: "2026-07-13",
    inputYen: 2_000,
    memo: "new add",
  });
  await vi.waitFor(() => expect(summary).toEqual(latestAddSummary));

  oldAddResponse.resolve(jsonResponse(oldAddSummary));
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  expect(summary).toEqual(latestAddSummary);
});
