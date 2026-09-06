import { Effect, Fiber } from "effect";
import { afterEach, expect, it, vi } from "vitest";
import { createHistoryMutationLifecycle } from "$lib/dashboard/history-mutation-lifecycle";
import { createPeriodUpdateEffect } from "$lib/dashboard/period-controller-update-effect";
import { createPeriodSummaryRequestTracker } from "$lib/dashboard/period-summary-request-tracker";
import { createPeriodSummaryRevision } from "$lib/dashboard/period-summary-revision";
import type { PeriodSummary } from "$lib/dashboard/controller-types";
import {
  createSummary,
  jsonResponse,
} from "./day-entry-controller-test-fixtures";
import { settled } from "./period-controller-effect-fixture";

afterEach(() => vi.unstubAllGlobals());

function invalidJsonResponse(): Response {
  return new Response("{", {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

it("releases a history slot before reconciling an unreadable success", async () => {
  const reconciliationResponse = Promise.withResolvers<Response>();
  const reconciliationStarted = Promise.withResolvers<void>();
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(invalidJsonResponse())
    .mockImplementationOnce(() => {
      reconciliationStarted.resolve();
      return reconciliationResponse.promise;
    });
  vi.stubGlobal("fetch", fetchMock);
  const revision = createPeriodSummaryRevision();
  let summary: PeriodSummary = createSummary(0);
  let error: string | null = null;
  const lifecycle = createHistoryMutationLifecycle({
    applyHistories: vi.fn(),
    applySummary: (nextSummary) => {
      summary = nextSummary;
    },
    bumpVersion: vi.fn(),
    getSelectedDate: () => "2026-07-12",
    getSelectedPeriodId: () => "period-1",
    getSummary: () => summary,
    invalidateHistoryLoads: vi.fn(),
    loadHistoryEffect: () =>
      Effect.sync(() => {
        error = null;
      }),
    retainHistories: vi.fn(),
    setError: (nextError) => {
      error = nextError;
    },
    summaryRevision: revision,
  });

  const mutation = Effect.runFork(
    lifecycle.mutateEffect(
      "history-1",
      { method: "DELETE" },
      "履歴の削除に失敗しました。",
    ),
  );
  await settled(reconciliationStarted.promise);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(lifecycle.getVisibleId(0)).toBeNull();

  let laterMutationStarted = false;
  await Effect.runPromise(
    revision.withMutationSlot(
      "period-1",
      "add",
      Effect.sync(() => {
        laterMutationStarted = true;
      }),
    ),
  );
  expect(laterMutationStarted).toBe(true);

  const authoritativeSummary = createSummary(500);
  reconciliationResponse.resolve(jsonResponse(authoritativeSummary));
  await Effect.runPromise(Fiber.join(mutation));
  expect(summary).toEqual(authoritativeSummary);
  expect(error).toBe("履歴の削除に失敗しました。");
});

it("preserves a history mutation error when reconciliation also fails", async () => {
  const mutationError = "履歴の更新に失敗しました。";
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({}, 500))
    .mockResolvedValueOnce(jsonResponse({}, 500));
  vi.stubGlobal("fetch", fetchMock);
  const revision = createPeriodSummaryRevision();
  let error: string | null = null;
  const lifecycle = createHistoryMutationLifecycle({
    applyHistories: vi.fn(),
    applySummary: vi.fn(),
    bumpVersion: vi.fn(),
    getSelectedDate: () => "2026-07-12",
    getSelectedPeriodId: () => "period-1",
    getSummary: () => createSummary(0),
    invalidateHistoryLoads: vi.fn(),
    loadHistoryEffect: () =>
      Effect.sync(() => {
        error = null;
      }),
    retainHistories: vi.fn(),
    setError: (nextError) => {
      error = nextError;
    },
    summaryRevision: revision,
  });

  await Effect.runPromise(
    lifecycle.mutateEffect("history-1", { method: "PATCH" }, mutationError),
  );

  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(error).toBe(mutationError);
});

it("releases a period slot before a pending reconciliation", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(invalidJsonResponse()));
  const revision = createPeriodSummaryRevision();
  const reconciliationStarted = Promise.withResolvers<void>();
  let saving = false;
  const updateEffect = createPeriodUpdateEffect({
    getSelectedPeriodId: () => "period-1",
    getSummary: () => createSummary(0),
    getSummaryLoading: () => false,
    publishSummary: vi.fn(),
    refreshPeriodListEffect: () =>
      Effect.sync(() => reconciliationStarted.resolve()).pipe(
        Effect.andThen(Effect.never),
      ),
    refreshSummaryEffect: () => Effect.void,
    setError: vi.fn(),
    setSaving: (nextSaving) => {
      saving = nextSaving;
    },
    summaryRequests: createPeriodSummaryRequestTracker(revision),
    summaryRevision: revision,
  });

  const update = Effect.runFork(
    updateEffect({
      budgetYen: 12_000,
      startDate: "2026-07-12",
      endDate: "2026-08-10",
    }),
  );
  try {
    await settled(reconciliationStarted.promise);
    expect(saving).toBe(true);

    let laterMutationStarted = false;
    await settled(
      Effect.runPromise(
        revision.withMutationSlot(
          "period-1",
          "history",
          Effect.sync(() => {
            laterMutationStarted = true;
          }),
        ),
      ),
    );
    expect(laterMutationStarted).toBe(true);
    expect(saving).toBe(true);
  } finally {
    await settled(Effect.runPromise(Fiber.interrupt(update)));
  }
  expect(saving).toBe(false);
});

it("preserves the mutation error while falling back after reconciliation fails", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(invalidJsonResponse()));
  const revision = createPeriodSummaryRevision();
  const refreshSummary = vi.fn(() => Effect.void);
  let saving = false;
  const setError = vi.fn();
  const updateEffect = createPeriodUpdateEffect({
    getSelectedPeriodId: () => "period-1",
    getSummary: () => createSummary(0),
    getSummaryLoading: () => false,
    publishSummary: vi.fn(),
    refreshPeriodListEffect: () => Effect.fail("補正に失敗しました。"),
    refreshSummaryEffect: refreshSummary,
    setError,
    setSaving: (nextSaving) => {
      saving = nextSaving;
    },
    summaryRequests: createPeriodSummaryRequestTracker(revision),
    summaryRevision: revision,
  });

  await Effect.runPromise(
    updateEffect({
      budgetYen: 12_000,
      startDate: "2026-07-12",
      endDate: "2026-08-10",
    }),
  );

  expect(saving).toBe(false);
  expect(setError.mock.calls.map(([message]) => message)).toEqual([
    null,
    "保存に失敗しました。",
  ]);
  expect(setError).toHaveBeenCalledTimes(2);
  expect(refreshSummary).toHaveBeenCalledWith("period-1", false);
});

it.each(["budget", "range"] as const)(
  "old update cleanup cannot release newer %s ownership or mutate its snapshot",
  async (newOperation) => {
    const revision = createPeriodSummaryRevision();
    const firstStarted = Promise.withResolvers<void>();
    const secondStarted = Promise.withResolvers<void>();
    const firstResponse = Promise.withResolvers<Response>();
    const secondResponse = Promise.withResolvers<Response>();
    const requests: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.method).toBe("PUT");
        requests.push({
          url: String(input),
          body: JSON.parse(String(init?.body)),
        });
        if (requests.length === 1) {
          firstStarted.resolve();
          return firstResponse.promise;
        }
        secondStarted.resolve();
        return secondResponse.promise;
      }),
    );
    const saving = { budget: false, range: false };
    const errors: Record<"budget" | "range", string | null> = {
      budget: null,
      range: null,
    };
    const publishSummary = vi.fn();
    const update = createPeriodUpdateEffect({
      getSelectedPeriodId: () => "period-1",
      getSummary: () => createSummary(0),
      getSummaryLoading: () => false,
      publishSummary,
      refreshPeriodListEffect: () => Effect.void,
      refreshSummaryEffect: () => Effect.void,
      setError: (message, operation = "range") => {
        errors[operation] = message;
      },
      setSaving: (value, operation = "range") => {
        saving[operation] = value;
      },
      summaryRequests: createPeriodSummaryRequestTracker(revision),
      summaryRevision: revision,
    });
    const first = Effect.runPromise(
      update(
        {
          budgetYen: 12_000,
          startDate: "2026-07-12",
          endDate: "2026-07-13",
        },
        "budget",
      ),
    );
    let second: Promise<void> | undefined;
    const nextPayload = {
      budgetYen: 13_000,
      startDate: "2026-07-12",
      endDate: "2026-07-14",
    };
    const acceptedPayload = { ...nextPayload };
    try {
      await settled(firstStarted.promise);
      second = Effect.runPromise(update(nextPayload, newOperation));
      nextPayload.budgetYen = 99_000;
      nextPayload.startDate = "2026-08-01";
      nextPayload.endDate = "2026-08-31";
      expect(saving[newOperation]).toBe(true);
      firstResponse.resolve(
        jsonResponse(
          {
            error: { message: "old-failure" },
          },
          500,
        ),
      );
      await settled(first);
      await settled(secondStarted.promise);
      expect(saving[newOperation]).toBe(true);
      if (newOperation === "range") expect(saving.budget).toBe(false);
      expect(errors).toEqual({ budget: null, range: null });
      expect(publishSummary).not.toHaveBeenCalled();
      expect(requests[1]).toEqual({
        url: "/api/periods/period-1",
        body: acceptedPayload,
      });
    } finally {
      firstResponse.resolve(
        jsonResponse({ error: { message: "old-failure" } }, 500),
      );
      secondResponse.resolve(
        jsonResponse({ error: { message: "new-failure" } }, 500),
      );
      await settled(first);
      if (second != null) await settled(second);
    }
    expect(requests).toHaveLength(2);
    expect(saving).toEqual({ budget: false, range: false });
    expect(errors[newOperation]).toBe("new-failure");
    expect(publishSummary).not.toHaveBeenCalled();
  },
);
