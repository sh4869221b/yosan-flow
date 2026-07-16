import { Effect, Fiber } from "effect";
import { afterEach, expect, it, vi } from "vitest";
import { createHistoryControllerState } from "$lib/dashboard/history-controller-state.svelte";
import { createPeriodSummaryRevision } from "$lib/dashboard/period-summary-revision";
import type { PeriodSummary } from "$lib/dashboard/controller-types";
import {
  createSummary,
  jsonResponse,
} from "./day-entry-controller-test-fixtures";

afterEach(() => vi.unstubAllGlobals());

it("keeps current state when a stale history body cannot be reconciled", async () => {
  const mutationResponse = Promise.withResolvers<Response>();
  const staleSummary = createSummary(500);
  const currentSummary = createSummary(2_500);
  const staleHistories = [{ id: "stale" }];
  const currentHistories = [{ id: "current" }];
  const fetchMock = vi
    .fn()
    .mockImplementationOnce(() => mutationResponse.promise)
    .mockResolvedValueOnce(jsonResponse({ error: {} }, 503))
    .mockResolvedValueOnce(jsonResponse({ error: {} }, 503));
  vi.stubGlobal("fetch", fetchMock);
  const revision = createPeriodSummaryRevision();
  let summary: PeriodSummary = createSummary(1_000);
  const controller = createHistoryControllerState(
    {
      getSelectedDate: () => "2026-07-12",
      getSelectedPeriodId: () => "period-1",
      getSummary: () => summary,
      setSelectedRow: vi.fn(),
      setSummary: (nextSummary) => {
        summary = nextSummary;
      },
    },
    revision,
  );

  controller.updateHistory({
    historyId: "history-1",
    inputYen: 500,
    memo: "stale",
  });
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  revision.publish(currentSummary, (nextSummary) => {
    summary = nextSummary;
  });
  Object.assign(controller.histories, currentHistories);
  mutationResponse.resolve(
    jsonResponse({ summary: staleSummary, histories: staleHistories }),
  );

  await vi.waitFor(() => expect(controller.historyMutatingId).toBeNull());
  expect(summary).toEqual(currentSummary);
  expect(controller.histories).toEqual(currentHistories);
  expect(controller.historyError).toBe("再取得に失敗しました。");
});

it("exposes a mutation indicator only for its owning period and date", async () => {
  const mutationResponse = Promise.withResolvers<Response>();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => mutationResponse.promise),
  );
  let periodId = "period-1";
  let date = "2026-07-12";
  const controller = createHistoryControllerState({
    getSelectedDate: () => date,
    getSelectedPeriodId: () => periodId,
    getSummary: () => createSummary(0),
    setSelectedRow: vi.fn(),
    setSummary: vi.fn(),
  });

  controller.updateHistory({
    historyId: "history-1",
    inputYen: 500,
    memo: "pending",
  });
  await vi.waitFor(() =>
    expect(controller.historyMutatingId).toBe("history-1"),
  );

  periodId = "period-2";
  date = "2026-08-13";
  expect(controller.historyMutatingId).toBeNull();

  periodId = "period-1";
  date = "2026-07-12";
  expect(controller.historyMutatingId).toBe("history-1");

  mutationResponse.resolve(
    jsonResponse({ summary: createSummary(500), histories: [] }),
  );
  await vi.waitFor(() => expect(controller.historyMutatingId).toBeNull());
});

it("keeps an active history mutation authoritative when another date is opened", async () => {
  const firstMutationResponse = Promise.withResolvers<Response>();
  const appliedSummary = createSummary(500);
  const fetchMock = vi
    .fn()
    .mockImplementationOnce(() => firstMutationResponse.promise)
    .mockResolvedValueOnce(jsonResponse({ error: {} }, 503));
  vi.stubGlobal("fetch", fetchMock);
  let date = "2026-07-12";
  let summary = createSummary(1_000);
  const controller = createHistoryControllerState({
    getSelectedDate: () => date,
    getSelectedPeriodId: () => "period-1",
    getSummary: () => summary,
    setSelectedRow: vi.fn(),
    setSummary: (nextSummary) => {
      summary = nextSummary;
    },
  });

  controller.updateHistory({
    historyId: "history-1",
    inputYen: 500,
    memo: "first",
  });
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

  date = "2026-07-13";
  controller.updateHistory({
    historyId: "history-2",
    inputYen: 100,
    memo: "second",
  });
  expect(controller.historyMutatingId).toBe("history-1");
  expect(fetchMock).toHaveBeenCalledOnce();

  firstMutationResponse.resolve(
    jsonResponse({ summary: appliedSummary, histories: [] }),
  );
  await vi.waitFor(() => expect(controller.historyMutatingId).toBeNull());

  expect(fetchMock).toHaveBeenCalledOnce();
  expect(summary).toEqual(appliedSummary);
});

it("does not clear another period error when a queued mutation starts", async () => {
  const revision = createPeriodSummaryRevision();
  const ownerStarted = Promise.withResolvers<void>();
  const owner = Effect.runFork(
    revision.withMutationSlot(
      "period-1",
      "add",
      Effect.sync(() => ownerStarted.resolve()).pipe(
        Effect.andThen(Effect.never),
      ),
    ),
  );
  await ownerStarted.promise;
  const queuedMutationResponse = Promise.withResolvers<Response>();
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ error: {} }, 503))
    .mockImplementationOnce(() => queuedMutationResponse.promise);
  vi.stubGlobal("fetch", fetchMock);
  let periodId = "period-1";
  let date = "2026-07-12";
  const controller = createHistoryControllerState(
    {
      getSelectedDate: () => date,
      getSelectedPeriodId: () => periodId,
      getSummary: () => createSummary(0),
      setSelectedRow: vi.fn(),
      setSummary: vi.fn(),
    },
    revision,
  );

  controller.updateHistory({
    historyId: "history-1",
    inputYen: 500,
    memo: "queued",
  });
  periodId = "period-2";
  date = "2026-08-13";
  await Effect.runPromise(controller.loadHistoryEffect(date));
  expect(controller.historyError).toBe("履歴の取得に失敗しました。");

  await Effect.runPromise(Fiber.interrupt(owner));
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(controller.historyError).toBe("履歴の取得に失敗しました。");

  queuedMutationResponse.resolve(jsonResponse({ error: {} }, 503));
  await vi.waitFor(() => expect(controller.historyMutatingId).toBeNull());
  expect(controller.historyError).toBe("履歴の取得に失敗しました。");
});
