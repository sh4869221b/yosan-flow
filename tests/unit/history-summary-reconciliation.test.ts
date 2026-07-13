import { Effect, Fiber } from "effect";
import { afterEach, expect, it, vi } from "vitest";
import { createHistorySummaryReconciliation } from "$lib/dashboard/history-summary-reconciliation";
import { createPeriodSummaryRevision } from "$lib/dashboard/period-summary-revision";
import {
  createSummary,
  jsonResponse,
} from "./day-entry-controller-test-fixtures";

afterEach(() => vi.unstubAllGlobals());

it("waits for an active mutation before recovering histories without a summary request", async () => {
  const revision = createPeriodSummaryRevision();
  const activeMutation = revision.beginMutation("period-1");
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const applySummary = vi.fn();
  const loadHistory = vi.fn(() => Effect.void);
  const reconcile = createHistorySummaryReconciliation({
    applySummary,
    getMutationSequence: () => 1,
    getSelectedDate: () => "2026-07-12",
    getSelectedPeriodId: () => "period-1",
    loadHistoryEffect: loadHistory,
    setError: vi.fn(),
    summaryRevision: revision,
  });

  const reconciliation = Effect.runFork(
    reconcile({
      date: "2026-07-12",
      mutationSequence: 1,
      originatingError: undefined,
      periodId: "period-1",
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(fetchMock).not.toHaveBeenCalled();
  expect(applySummary).not.toHaveBeenCalled();
  expect(loadHistory).not.toHaveBeenCalled();

  revision.completeMutation("period-1", activeMutation);
  await Effect.runPromise(Fiber.join(reconciliation));

  expect(fetchMock).not.toHaveBeenCalled();
  expect(applySummary).not.toHaveBeenCalled();
  expect(loadHistory).toHaveBeenCalledWith("2026-07-12");
});

it("abandons active-mutation recovery after a later history sequence takes ownership", async () => {
  const revision = createPeriodSummaryRevision();
  const activeMutation = revision.beginMutation("period-1");
  let historySequence = 1;
  const loadHistory = vi.fn(() => Effect.void);
  const reconcile = createHistorySummaryReconciliation({
    applySummary: vi.fn(),
    getMutationSequence: () => historySequence,
    getSelectedDate: () => "2026-07-12",
    getSelectedPeriodId: () => "period-1",
    loadHistoryEffect: loadHistory,
    setError: vi.fn(),
    summaryRevision: revision,
  });

  const reconciliation = Effect.runFork(
    reconcile({
      date: "2026-07-12",
      mutationSequence: historySequence,
      originatingError: undefined,
      periodId: "period-1",
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  historySequence += 1;
  revision.completeMutation("period-1", activeMutation);
  await Effect.runPromise(Fiber.join(reconciliation));

  expect(loadHistory).not.toHaveBeenCalled();
});

it("loads histories without publishing a summary invalidated by a later period mutation", async () => {
  const reconciliationResponse = Promise.withResolvers<Response>();
  const fetchMock = vi.fn(() => reconciliationResponse.promise);
  vi.stubGlobal("fetch", fetchMock);
  const revision = createPeriodSummaryRevision();
  const applySummary = vi.fn();
  const loadHistory = vi.fn(() => Effect.void);
  const reconcile = createHistorySummaryReconciliation({
    applySummary,
    getMutationSequence: () => 1,
    getSelectedDate: () => "2026-07-12",
    getSelectedPeriodId: () => "period-1",
    loadHistoryEffect: loadHistory,
    setError: vi.fn(),
    summaryRevision: revision,
  });

  const reconciliation = Effect.runFork(
    reconcile({
      date: "2026-07-12",
      mutationSequence: 1,
      originatingError: undefined,
      periodId: "period-1",
    }),
  );
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  const laterMutation = revision.beginMutation("period-1");
  revision.completeMutation("period-1", laterMutation);
  reconciliationResponse.resolve(jsonResponse(createSummary(500)));
  await Effect.runPromise(Fiber.join(reconciliation));

  expect(applySummary).not.toHaveBeenCalled();
  expect(loadHistory).toHaveBeenCalledWith("2026-07-12");
});
