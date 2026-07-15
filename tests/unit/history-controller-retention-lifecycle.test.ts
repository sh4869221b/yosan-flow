import { Effect } from "effect";
import { afterEach, expect, it, vi } from "vitest";
import { createHistoryControllerState } from "$lib/dashboard/history-controller-state.svelte";
import { createPeriodSummaryRevision } from "$lib/dashboard/period-summary-revision";
import type { PeriodSummary } from "$lib/dashboard/controller-types";
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

function deferredResponse(): {
  readonly promise: Promise<Response>;
  readonly resolve: (_response: Response) => void;
} {
  let resolveResponse: (_response: Response) => void = () => undefined;
  const promise = new Promise<Response>((resolve) => {
    resolveResponse = resolve;
  });
  return { promise, resolve: resolveResponse };
}

function createHarness(fetchMock: ReturnType<typeof vi.fn>) {
  let selectedDate = "2026-07-12";
  let summary: PeriodSummary = createSummary(0);
  const revision = createPeriodSummaryRevision();
  vi.stubGlobal("fetch", fetchMock);
  const controller = createHistoryControllerState(
    {
      getSelectedDate: () => selectedDate,
      getSelectedPeriodId: () => "period-1",
      getSummary: () => summary,
      setSelectedRow: vi.fn(),
      setSummary: (nextSummary) => {
        summary = nextSummary;
      },
    },
    revision,
  );
  return {
    controller,
    revision,
    setDate: (date: string) => {
      selectedDate = date;
    },
    setSummary: (nextSummary: PeriodSummary) => {
      summary = nextSummary;
    },
  };
}

async function retainOffscreen(
  harness: ReturnType<typeof createHarness>,
  mutation: ReturnType<typeof deferredResponse>,
  history: HistoryItem,
): Promise<void> {
  harness.setDate(history.date);
  harness.controller.updateHistory({
    historyId: history.id,
    inputYen: history.inputYen,
    memo: history.memo ?? "",
  });
  await vi.waitFor(() =>
    expect(harness.controller.historyMutatingId).toBe(history.id),
  );
  harness.setDate("off-screen");
  mutation.resolve(
    jsonResponse({ summary: createSummary(500), histories: [history] }),
  );
  await vi.waitFor(() =>
    expect(harness.controller.historyMutatingId).toBeNull(),
  );
}

it("invalidates retained histories after a later day-add mutation updates the summary", async () => {
  const mutation = deferredResponse();
  const fetchMock = vi
    .fn()
    .mockImplementationOnce(() => mutation.promise)
    .mockResolvedValueOnce(jsonResponse({ error: {} }, 503));
  const harness = createHarness(fetchMock);
  const retained = createHistory("PATCH_RETAINED", "2026-07-12");
  await retainOffscreen(harness, mutation, retained);

  const addMutation = harness.revision.beginMutation("period-1");
  harness.revision.completeMutation("period-1", addMutation);
  harness.setSummary(createSummary(1_000));
  harness.setDate(retained.date);
  harness.controller.resetHistories();
  await Effect.runPromise(harness.controller.loadHistoryEffect(retained.date));

  expect(harness.controller.histories).toEqual([]);
});

it("invalidates retained histories when the period configuration changes", async () => {
  const mutation = deferredResponse();
  const fetchMock = vi
    .fn()
    .mockImplementationOnce(() => mutation.promise)
    .mockResolvedValueOnce(jsonResponse({ error: {} }, 503));
  const harness = createHarness(fetchMock);
  const retained = createHistory("OLD_CONFIGURATION", "2026-07-12");
  await retainOffscreen(harness, mutation, retained);

  harness.setSummary({ ...createSummary(0), budgetYen: 20_000 });
  harness.setDate(retained.date);
  harness.controller.resetHistories();
  await Effect.runPromise(harness.controller.loadHistoryEffect(retained.date));

  expect(harness.controller.histories).toEqual([]);
});

it("does not retain a successful mutation that settles on the current date", async () => {
  const committed = createHistory("CURRENT_DATE", "2026-07-12");
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      jsonResponse({ summary: createSummary(500), histories: [committed] }),
    )
    .mockResolvedValueOnce(jsonResponse({ error: {} }, 503));
  const harness = createHarness(fetchMock);
  harness.controller.updateHistory({
    historyId: committed.id,
    inputYen: committed.inputYen,
    memo: committed.memo ?? "",
  });
  await vi.waitFor(() =>
    expect(harness.controller.historyMutatingId).toBeNull(),
  );

  harness.controller.resetHistories();
  await Effect.runPromise(harness.controller.loadHistoryEffect(committed.date));

  expect(harness.controller.histories).toEqual([]);
});

it("evicts retained histories after an authoritative history response", async () => {
  const mutation = deferredResponse();
  const retained = createHistory("PATCH_RETAINED", "2026-07-12");
  const authoritative = createHistory("AUTHORITATIVE", retained.date);
  const fetchMock = vi
    .fn()
    .mockImplementationOnce(() => mutation.promise)
    .mockResolvedValueOnce(jsonResponse({ histories: [authoritative] }))
    .mockResolvedValueOnce(jsonResponse({ error: {} }, 503));
  const harness = createHarness(fetchMock);
  await retainOffscreen(harness, mutation, retained);
  harness.setDate(retained.date);
  await Effect.runPromise(harness.controller.loadHistoryEffect(retained.date));
  expect(harness.controller.histories).toEqual([authoritative]);

  harness.controller.resetHistories();
  await Effect.runPromise(harness.controller.loadHistoryEffect(retained.date));

  expect(harness.controller.histories).toEqual([]);
});
