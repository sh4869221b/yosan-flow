import { Effect, Fiber } from "effect";
import { afterEach, expect, it, vi } from "vitest";
import { createPeriodRefreshEffects } from "#lib/dashboard/period-controller-refresh-effect.ts";
import { createPeriodSummaryRequestTracker } from "#lib/dashboard/period-summary-request-tracker.ts";
import { createPeriodSummaryRevision } from "#lib/dashboard/period-summary-revision.ts";
import {
  createSummary,
  jsonResponse,
} from "./day-entry-controller-test-fixtures";

afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const summaryRevision = createPeriodSummaryRevision();
  const setLoading = vi.fn();
  const publishSummary = vi.fn();
  const effects = createPeriodRefreshEffects({
    summaryRevision,
    summaryRequests: createPeriodSummaryRequestTracker(summaryRevision),
    getSelectedPeriodId: () => "period-1",
    publishSummary,
    setLoading,
    setError: vi.fn(),
    setPeriods: vi.fn(),
    selectEmpty: vi.fn(),
  });
  return { ...effects, setLoading, publishSummary, summaryRevision };
}

it("clears loading when the current summary read is interrupted", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>(() => {})),
  );
  const state = fixture();
  const fiber = Effect.runFork(state.refreshSummaryEffect("period-1"));
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  expect(state.setLoading).toHaveBeenLastCalledWith(true);
  await Effect.runPromise(Fiber.interrupt(fiber));
  expect(state.setLoading).toHaveBeenLastCalledWith(false);
  expect(state.publishSummary).not.toHaveBeenCalled();
});

it("keeps a newer foreground read loading when an older read is interrupted", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>(() => {})),
  );
  const state = fixture();
  const older = Effect.runFork(state.refreshSummaryEffect("period-1"));
  const newer = Effect.runFork(state.refreshSummaryEffect("period-2"));
  try {
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    await Effect.runPromise(Fiber.interrupt(older));
    expect(state.setLoading).toHaveBeenLastCalledWith(true);
  } finally {
    await Effect.runPromise(Fiber.interrupt(newer));
  }
  expect(state.setLoading).toHaveBeenLastCalledWith(false);
});

it.each(["success", "failure", "empty"])(
  "releases foreground loading when resume supersedes it (%s)",
  async (outcome) => {
    const oldResponse = Promise.withResolvers<Response>();
    const started = Promise.withResolvers<void>();
    let reads = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (++reads === 1) {
          started.resolve();
          return oldResponse.promise;
        }
        if (url === "/api/periods") {
          return Promise.resolve(
            outcome === "failure"
              ? jsonResponse({ error: {} }, 503)
              : jsonResponse({
                  periods: outcome === "empty" ? [] : [{ id: "period-1" }],
                }),
          );
        }
        return Promise.resolve(jsonResponse(createSummary(2_000)));
      }),
    );
    const state = fixture();
    const foreground = Effect.runPromise(
      state.refreshSummaryEffect("period-1"),
    );
    try {
      await started.promise;
      expect(state.setLoading).toHaveBeenLastCalledWith(true);
      await Effect.runPromise(state.refreshOnResumeEffect());
      expect(state.setLoading).toHaveBeenLastCalledWith(false);
    } finally {
      oldResponse.resolve(jsonResponse(createSummary(0)));
      await foreground;
    }
    expect(state.publishSummary).not.toHaveBeenCalledWith(
      createSummary(0),
      undefined,
    );
  },
);
