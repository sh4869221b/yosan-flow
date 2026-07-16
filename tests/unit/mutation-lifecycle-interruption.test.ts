import { Effect, Fiber } from "effect";
import { afterEach, expect, it, vi } from "vitest";
import { createDayEntryMutationLifecycle } from "$lib/dashboard/day-entry-mutation-lifecycle";
import { createHistoryMutationLifecycle } from "$lib/dashboard/history-mutation-lifecycle";
import { createPeriodSummaryRevision } from "$lib/dashboard/period-summary-revision";
import { createSummary } from "./day-entry-controller-test-fixtures";

afterEach(() => vi.unstubAllGlobals());

it("cleans up an interrupted day-entry mutation lifecycle", async () => {
  const pendingResponse = Promise.withResolvers<Response>();
  const fetchMock = vi.fn(() => pendingResponse.promise);
  vi.stubGlobal("fetch", fetchMock);
  const revision = createPeriodSummaryRevision();
  let saving = false;
  const lifecycle = createDayEntryMutationLifecycle({
    closeModal: vi.fn(),
    getHistoryMutationSequence: () => 0,
    getSelectedDate: () => "2026-07-12",
    getSelectedPeriodId: () => "period-1",
    getSummary: () => createSummary(0),
    loadHistoryEffect: () => Effect.void,
    setError: vi.fn(),
    setSaving: (nextSaving) => {
      saving = nextSaving;
    },
    setSelectedRow: vi.fn(),
    setSummary: vi.fn(),
    summaryRevision: revision,
  });
  lifecycle.beginModalSession();

  const fiber = Effect.runFork(
    lifecycle.submitEffect({
      date: "2026-07-12",
      inputYen: 500,
      memo: "pending",
    }),
  );
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  expect(saving).toBe(true);

  await Effect.runPromise(Fiber.interrupt(fiber));

  expect(saving).toBe(false);
  await Effect.runPromise(
    revision
      .withMutationSlot("period-1", "history", Effect.void)
      .pipe(Effect.timeout("100 millis")),
  );
});

it("cleans up an interrupted history mutation lifecycle", async () => {
  const pendingResponse = Promise.withResolvers<Response>();
  const fetchMock = vi.fn(() => pendingResponse.promise);
  vi.stubGlobal("fetch", fetchMock);
  const revision = createPeriodSummaryRevision();
  const lifecycle = createHistoryMutationLifecycle({
    applyHistories: vi.fn(),
    applySummary: vi.fn(),
    bumpVersion: vi.fn(),
    getSelectedDate: () => "2026-07-12",
    getSelectedPeriodId: () => "period-1",
    getSummary: () => createSummary(0),
    invalidateHistoryLoads: vi.fn(),
    loadHistoryEffect: () => Effect.void,
    retainHistories: vi.fn(),
    setError: vi.fn(),
    summaryRevision: revision,
  });

  const fiber = Effect.runFork(
    lifecycle.mutateEffect(
      "history-1",
      { method: "DELETE" },
      "履歴の削除に失敗しました。",
    ),
  );
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  expect(lifecycle.getVisibleId(0)).toBe("history-1");

  await Effect.runPromise(Fiber.interrupt(fiber));

  expect(lifecycle.getVisibleId(0)).toBeNull();
  await Effect.runPromise(
    revision
      .withMutationSlot("period-1", "period", Effect.void)
      .pipe(Effect.timeout("100 millis")),
  );
});
