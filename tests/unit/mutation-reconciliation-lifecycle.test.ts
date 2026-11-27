import { createPeriodUpdateConfirmationState } from "#lib/dashboard/period-update-confirmation-state.svelte.ts";
import { Effect, Fiber } from "effect";
import { afterEach, expect, it, vi } from "vitest";
import { createHistoryMutationLifecycle } from "#lib/dashboard/history-mutation-lifecycle.ts";
import { createPeriodUpdateEffect } from "#lib/dashboard/period-controller-update-effect.ts";
import { createPeriodSummaryRequestTracker } from "#lib/dashboard/period-summary-request-tracker.ts";
import { createPeriodSummaryRevision } from "#lib/dashboard/period-summary-revision.ts";
import type { PeriodSummary } from "#lib/dashboard/controller-types.ts";
import {
  createSummary,
  jsonResponse,
} from "./day-entry-controller-test-fixtures";
import { settled } from "./period-controller-effect-fixture";
import { targetPeriod } from "./period-controller-confirmation-fixture";

afterEach(() => vi.unstubAllGlobals());

function invalidJsonResponse(): Response {
  return new Response("{", {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

it.each([
  "current",
  "newer summary",
  "newer request",
  "another period",
] as const)(
  "settles a queued budget PUT without summary when the view is %s",
  async (view) => {
    const revision = createPeriodSummaryRevision();
    const summaryRequests = createPeriodSummaryRequestTracker(revision);
    let selectedId = targetPeriod.id;
    const getSelectedPeriodId = () => selectedId;
    const historyStarted = Promise.withResolvers<void>();
    const releaseHistory = Promise.withResolvers<void>();
    const putStarted = Promise.withResolvers<void>();
    const put = Promise.withResolvers<Response>();
    const fetch = vi.fn(() => {
      expect(revision.get(targetPeriod.id)).toBe(1);
      putStarted.resolve();
      return put.promise;
    });
    vi.stubGlobal("fetch", fetch);
    const publishUnavailableSummary = vi.fn();
    const publishSummary = vi.fn();
    const update = createPeriodUpdateEffect({
      confirmationState: createPeriodUpdateConfirmationState({
        getSelectedPeriodId,
        summaryRevision: revision,
      }),
      getSelectedPeriodId,
      getSummary: () => createSummary(0),
      getSummaryLoading: () => false,
      publishSummary,
      publishUnavailableSummary,
      refreshPeriodListEffect: () => Effect.void,
      refreshSummaryEffect: () => Effect.void,
      setError: vi.fn(),
      setSaving: vi.fn(),
      summaryRequests,
      summaryRevision: revision,
    });
    const history = Effect.runPromise(
      revision.withMutationSlot(
        targetPeriod.id,
        "history",
        Effect.promise(() => {
          historyStarted.resolve();
          return releaseHistory.promise;
        }).pipe(
          Effect.tap(() =>
            Effect.sync(() => revision.advance(targetPeriod.id)),
          ),
        ),
      ),
    );
    await settled(historyStarted.promise);
    const budgetYen = 777;
    const save = Effect.runPromise(
      update({ ...targetPeriod, budgetYen }, "budget"),
    );
    expect(fetch).not.toHaveBeenCalled();
    releaseHistory.resolve();
    await settled(history);
    await settled(putStarted.promise);

    if (view === "newer summary") revision.advance(targetPeriod.id);
    if (view === "newer request") summaryRequests.start(targetPeriod.id);
    if (view === "another period") selectedId = "period-2";
    const period = { ...targetPeriod, budgetYen };
    const summaryError = {
      code: "YEN_TOTAL_OUT_OF_RANGE",
      message: "集計を表示できません。",
    };
    put.resolve(jsonResponse({ period, summary: null, summaryError }));
    await settled(save);
    if (view === "current") {
      expect(publishUnavailableSummary).toHaveBeenCalledExactlyOnceWith({
        kind: "saved-without-summary",
        period,
        linkedPeriod: null,
        message: summaryError.message,
      });
    } else {
      expect(publishUnavailableSummary).not.toHaveBeenCalled();
    }
    expect(publishSummary).not.toHaveBeenCalled();
  },
);

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
      }).pipe(Effect.as({ kind: "success" } as const)),
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
      }).pipe(Effect.as({ kind: "success" } as const)),
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
    confirmationState: createPeriodUpdateConfirmationState({
      getSelectedPeriodId: () => "period-1",
      summaryRevision: revision,
    }),
    getSelectedPeriodId: () => "period-1",
    getSummary: () => createSummary(0),
    getSummaryLoading: () => false,
    publishSummary: vi.fn(),
    publishUnavailableSummary: vi.fn(),
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
    updateEffect(
      {
        budgetYen: 12_000,
        startDate: "2026-07-12",
        endDate: "2026-08-10",
      },
      "budget",
    ),
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
    confirmationState: createPeriodUpdateConfirmationState({
      getSelectedPeriodId: () => "period-1",
      summaryRevision: revision,
    }),
    getSelectedPeriodId: () => "period-1",
    getSummary: () => createSummary(0),
    getSummaryLoading: () => false,
    publishSummary: vi.fn(),
    publishUnavailableSummary: vi.fn(),
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
    updateEffect(
      {
        budgetYen: 12_000,
        startDate: "2026-07-12",
        endDate: "2026-08-10",
      },
      "budget",
    ),
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
      confirmationState: createPeriodUpdateConfirmationState({
        getSelectedPeriodId: () => "period-1",
        summaryRevision: revision,
      }),
      getSelectedPeriodId: () => "period-1",
      getSummary: () => createSummary(0),
      getSummaryLoading: () => false,
      publishSummary,
      publishUnavailableSummary: vi.fn(),
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
        body:
          newOperation === "budget"
            ? { budgetYen: acceptedPayload.budgetYen }
            : {
                startDate: acceptedPayload.startDate,
                endDate: acceptedPayload.endDate,
              },
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
