import { Effect } from "effect";
import { expect, it, vi } from "vitest";
import { fetchJsonEffect } from "$lib/dashboard/fetch-json";
import { createPeriodUpdateEffect } from "$lib/dashboard/period-controller-update-effect";
import * as periodUpdateEffects from "$lib/dashboard/period-controller-update-effect";
import { createPeriodSummaryRequestTracker } from "$lib/dashboard/period-summary-request-tracker";
import { createPeriodUpdateConfirmationState } from "$lib/dashboard/period-update-confirmation-state.svelte";
import type { PeriodSummary } from "$lib/dashboard/controller-types";
import {
  captureClientEffects,
  settled,
} from "./period-controller-effect-fixture";
import { createPeriodSummaryRevision } from "$lib/dashboard/period-summary-revision";
import {
  createSummary,
  jsonResponse,
} from "./day-entry-controller-test-fixtures";
import { registerPeriodUpdateApiParserTests } from "./period-controller-confirmation-api-tests";
import {
  confirmationBody,
  createController,
  forPeriod,
  proposal,
  successorPeriod,
  targetPeriod,
  updatedTargetSummary,
} from "./period-controller-confirmation-fixture";

const executions = captureClientEffects();

registerPeriodUpdateApiParserTests();

it.each([false, true])(
  "low-level budget confirmation outcome cannot own a range proposal (pending=%s)",
  async (withPending) => {
    // Capture the controller's real Effect, retaining its settings, queue,
    // request tracker, confirmation state, and revision bookkeeping.
    const factory = vi.spyOn(periodUpdateEffects, "createPeriodUpdateEffect");
    const revision = createPeriodSummaryRevision();
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse(confirmationBody, 409)),
    );
    vi.stubGlobal("fetch", fetchMock);
    const controller = createController(revision);
    const actualEffect = factory.mock.results[0].value as ReturnType<
      typeof createPeriodUpdateEffect
    >;
    const confirmationState = factory.mock.calls[0][0].confirmationState;
    controller.budget.draft = "13000";
    if (withPending) {
      controller.handleRangeChange({
        startDate: proposal.target.after.startDate,
        endDate: proposal.target.after.endDate,
      });
      await settled(executions[0]);
      expect(controller.periodUpdateProposal).toEqual(proposal);
    }
    const pending = confirmationState?.pending;
    const rangeDraft = { ...controller.range.draft };
    const payload = {
      budgetYen: 13_000,
      startDate: targetPeriod.startDate,
      endDate: targetPeriod.endDate,
    };

    const effect = actualEffect(payload, "budget");
    const pendingAfterAcceptance = confirmationState?.pending;
    await settled(Effect.runPromise(effect));

    expect(pendingAfterAcceptance).toEqual(pending);
    expect(confirmationState?.pending).toEqual(pending);
    expect(controller.periodUpdateProposal).toEqual(
      withPending ? proposal : null,
    );
    expect(fetchMock).toHaveBeenCalledTimes(withPending ? 2 : 1);
    expect(fetchMock.mock.lastCall?.[0]).toBe(
      `/api/periods/${targetPeriod.id}`,
    );
    expect(fetchMock.mock.lastCall?.[1]?.method).toBe("PUT");
    expect(JSON.parse(String(fetchMock.mock.lastCall?.[1]?.body))).toEqual(
      payload,
    );
    expect(controller.summary).toEqual(createSummary(0));
    expect(controller.budget.draft).toBe("13000");
    expect(controller.budget.serverError).not.toBeNull();
    expect(controller.budget.success).toBe(false);
    expect(controller.budget.saving).toBe(false);
    expect(controller.range.draft).toEqual(rangeDraft);
    expect(controller.range.serverError).toBeNull();
    expect(controller.range.success).toBe(false);
    expect(controller.range.saving).toBe(false);
    expect(controller.periodError).toBeNull();
    expect(controller.periodInteractionDisabled).toBe(withPending);
    expect(revision.getMutationSequence(targetPeriod.id)).toBe(0);
    expect(revision.get(targetPeriod.id)).toBe(0);
    expect(revision.get(successorPeriod.id)).toBe(0);
  },
);

it("opens, confirms once, and reconciles both period revisions", async () => {
  const confirmResponse = Promise.withResolvers<Response>();
  const confirmStarted = Promise.withResolvers<void>();
  const revision = createPeriodSummaryRevision();
  const summary = updatedTargetSummary();
  const requestOrder: string[] = [];
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    requestOrder.push(`${method} ${url}`);
    if (method === "PUT" && requestOrder.length === 1) {
      return Promise.resolve(jsonResponse(confirmationBody, 409));
    }
    if (method === "PUT") {
      confirmStarted.resolve();
      return confirmResponse.promise;
    }
    if (method === "GET" && url === "/api/periods") {
      return Promise.resolve(
        jsonResponse({
          periods: [
            { ...targetPeriod, endDate: proposal.target.after.endDate },
            {
              ...successorPeriod,
              startDate: proposal.successor.after.startDate,
            },
          ],
        }),
      );
    }
    if (method === "GET" && url.endsWith(`/${targetPeriod.id}`)) {
      return Promise.resolve(jsonResponse(summary));
    }
    throw new Error(`Unexpected fetch: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  const controller = createController(revision);

  controller.budget.draft = "13000";
  controller.handleRangeChange({
    startDate: proposal.target.after.startDate,
    endDate: proposal.target.after.endDate,
  });
  await settled(executions[0]);
  expect(controller.periodUpdateProposal).toEqual(proposal);
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(controller.range.saving).toBe(false);
  expect(controller.periodInteractionDisabled).toBe(true);
  expect(revision.getMutationSequence(targetPeriod.id)).toBe(0);
  expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
    budgetYen: targetPeriod.budgetYen,
    startDate: proposal.target.after.startDate,
    endDate: proposal.target.after.endDate,
  });
  expect(controller.range.success).toBe(false);
  expect(controller.budget.success).toBe(false);
  controller.saveBudget();
  controller.saveRange();
  controller.handleSavePeriod({ budgetYen: 14_000 });
  controller.handleRangeChange({
    startDate: targetPeriod.startDate,
    endDate: targetPeriod.endDate,
  });
  controller.createInitialPeriod();
  controller.budget.reset();
  controller.range.reset();
  expect(executions).toHaveLength(1);
  expect(controller.budget.draft).toBe("13000");
  expect(controller.range.draft).toEqual({
    startDate: proposal.target.after.startDate,
    endDate: proposal.target.after.endDate,
  });
  expect(controller.periodUpdateProposal).toEqual(proposal);

  controller.confirmPeriodUpdate();
  controller.confirmPeriodUpdate();
  try {
    await settled(confirmStarted.promise);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(controller.confirmSaving).toBe(true);
    expect(controller.periodInteractionDisabled).toBe(true);
    controller.cancelPeriodUpdateConfirmation();
    expect(controller.periodUpdateProposal).toEqual(proposal);
    expect(controller.budget.draft).toBe("13000");
    expect(controller.range.success).toBe(false);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      budgetYen: proposal.target.after.budgetYen,
      confirmation: proposal,
      endDate: proposal.target.after.endDate,
      startDate: proposal.target.after.startDate,
    });
  } finally {
    confirmResponse.resolve(jsonResponse(summary));
    await settled(executions[1]);
  }
  expect(controller.confirmSaving).toBe(false);

  expect(requestOrder).toEqual([
    `PUT /api/periods/${targetPeriod.id}`,
    `PUT /api/periods/${targetPeriod.id}`,
    "GET /api/periods",
    `GET /api/periods/${targetPeriod.id}`,
  ]);
  expect(controller.periodUpdateProposal).toBeNull();
  expect(controller.periodInteractionDisabled).toBe(false);
  expect(controller.summary).toEqual(summary);
  expect(controller.range.success).toBe(true);
  expect(controller.range.dirty).toBe(false);
  expect(controller.range.serverError).toBeNull();
  expect(controller.budget.draft).toBe("13000");
  expect(controller.budget.dirty).toBe(true);
  expect(controller.budget.success).toBe(false);
  expect(controller.budget.serverError).toBeNull();
  expect(controller.periodError).toBeNull();
  expect(revision.get(targetPeriod.id)).toBeGreaterThan(0);
  expect(revision.get(successorPeriod.id)).toBeGreaterThan(0);
});

it("proposal cancel preserves budget draft without confirming and restores authoritative range inputs", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(jsonResponse(confirmationBody, 409));
  vi.stubGlobal("fetch", fetchMock);
  const controller = createController();

  controller.budget.draft = "13000";
  controller.createBudgetInput = "777";
  controller.handleRangeChange({
    startDate: proposal.target.after.startDate,
    endDate: proposal.target.after.endDate,
  });
  await settled(executions[0]);
  expect(controller.periodUpdateProposal).toEqual(proposal);
  controller.cancelPeriodUpdateConfirmation();

  expect(fetchMock).toHaveBeenCalledOnce();
  expect(controller.periodUpdateProposal).toBeNull();
  expect(controller.rangeStartDate).toBe(targetPeriod.startDate);
  expect(controller.rangeEndDate).toBe(targetPeriod.endDate);
  expect(controller.range.dirty).toBe(false);
  expect(controller.range.success).toBe(false);
  expect(controller.range.serverError).toBeNull();
  expect(controller.budget.draft).toBe("13000");
  expect(controller.budget.dirty).toBe(true);
  expect(controller.budget.success).toBe(false);
  expect(controller.budget.serverError).toBeNull();
  expect(controller.createBudgetInput).toBe("777");
  expect(controller.periodError).toBeNull();
  expect(controller.periodInteractionDisabled).toBe(false);
});

it.each([targetPeriod.id, successorPeriod.id])(
  "rejects confirmation when %s becomes stale inside the mutation-slot wait",
  async (stalePeriodId) => {
    const revision = createPeriodSummaryRevision();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT")
        return Promise.resolve(jsonResponse(confirmationBody, 409));
      return Promise.resolve(
        jsonResponse(
          String(input) === "/api/periods"
            ? { periods: [targetPeriod, successorPeriod] }
            : createSummary(0),
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const controller = createController(revision);
    controller.budget.draft = "13000";
    controller.handleRangeChange({
      startDate: proposal.target.after.startDate,
      endDate: proposal.target.after.endDate,
    });
    await settled(executions[0]);
    expect(controller.periodUpdateProposal).toEqual(proposal);

    const slotStarted = Promise.withResolvers<void>();
    const releaseSlot = Promise.withResolvers<void>();
    const earlierMutation = Effect.runPromise(
      revision.withMutationSlot(
        targetPeriod.id,
        "history",
        Effect.gen(function* () {
          slotStarted.resolve();
          yield* Effect.promise(() => releaseSlot.promise);
        }),
      ),
    );
    try {
      await settled(slotStarted.promise);
      controller.confirmPeriodUpdate();
      expect(controller.confirmSaving).toBe(true);
      expect(controller.periodInteractionDisabled).toBe(true);
      expect(fetchMock).toHaveBeenCalledOnce();
      revision.advance(stalePeriodId);
      // Do not read pending here: rejection must happen inside the slot,
      // not through the public getter's stale-proposal cleanup.
    } finally {
      releaseSlot.resolve();
      await settled(earlierMutation);
      await settled(Promise.all(executions));
    }

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(controller.confirmation.result?.kind).toBe("reedit");
    expect(controller.range.dirty).toBe(false);
    expect(controller.periodUpdateProposal).toBeNull();
    expect(controller.confirmSaving).toBe(false);
    expect(controller.periodInteractionDisabled).toBe(false);
    expect(controller.summary).toEqual(createSummary(0));
    expect(controller.budget.draft).toBe("13000");
    expect(controller.budget.serverError).toBeNull();
    expect(controller.range.success).toBe(false);
    expect(controller.range.serverError).toBeNull();
    expect(controller.periodError).toBeNull();
    expect(revision.getMutationSequence(targetPeriod.id)).toBe(0);
  },
);

it("drops stale proposals and preserves conflicts", async () => {
  const revision = createPeriodSummaryRevision();
  const conflictMessage =
    "確認後に予算期間が変更されたため、もう一度操作してください。";
  const authoritativeSummary = createSummary(0);
  const requestOrder: string[] = [];
  let putCount = 0;
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    requestOrder.push(`${method} ${url}`);
    if (method === "PUT") {
      putCount += 1;
      if (putCount <= 2) {
        return Promise.resolve(jsonResponse(confirmationBody, 409));
      }
      return Promise.resolve(
        jsonResponse(
          {
            error: {
              code: "PERIOD_UPDATE_CONFLICT",
              message: conflictMessage,
            },
          },
          409,
        ),
      );
    }
    if (method === "GET" && url === "/api/periods") {
      return Promise.resolve(
        jsonResponse({ periods: [targetPeriod, successorPeriod] }),
      );
    }
    if (method === "GET" && url.endsWith(`/${targetPeriod.id}`)) {
      return Promise.resolve(jsonResponse(authoritativeSummary));
    }
    throw new Error(`Unexpected fetch: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  const controller = createController(revision);

  controller.budget.draft = "13000";
  controller.handleRangeChange({
    startDate: proposal.target.after.startDate,
    endDate: proposal.target.after.endDate,
  });
  await settled(executions[0]);
  expect(controller.periodUpdateProposal).toEqual(proposal);
  revision.advance(successorPeriod.id);

  expect(controller.periodUpdateProposal).toBeNull();
  expect(fetchMock).toHaveBeenCalledOnce();

  controller.handleRangeChange({
    startDate: proposal.target.after.startDate,
    endDate: proposal.target.after.endDate,
  });
  await settled(executions[1]);
  expect(controller.periodUpdateProposal).toEqual(proposal);
  controller.confirmPeriodUpdate();
  await settled(executions[2]);
  expect(controller.confirmSaving).toBe(false);

  expect(controller.periodUpdateProposal).toBeNull();
  expect(controller.range.serverError).toBeNull();
  expect(controller.confirmation.result?.kind).toBe("reedit");
  expect(controller.range.success).toBe(false);
  expect(controller.range.dirty).toBe(false);
  expect(controller.budget.draft).toBe("13000");
  expect(controller.budget.serverError).toBeNull();
  expect(controller.budget.success).toBe(false);
  expect(controller.periodError).toBeNull();
  expect(controller.summary).toEqual(authoritativeSummary);
  expect(requestOrder.slice(-3)).toEqual([
    `PUT /api/periods/${targetPeriod.id}`,
    "GET /api/periods",
    `GET /api/periods/${targetPeriod.id}`,
  ]);
});

it("ignores a preview that settles after selection changes", async () => {
  const previewResponse = Promise.withResolvers<Response>();
  const previewStarted = Promise.withResolvers<void>();
  const selectedSummary = forPeriod(createSummary(0), successorPeriod.id);
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method === "PUT") {
      previewStarted.resolve();
      return previewResponse.promise;
    }
    if (method === "GET" && url.endsWith(`/${successorPeriod.id}`)) {
      return Promise.resolve(jsonResponse(selectedSummary));
    }
    throw new Error(`Unexpected fetch: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  const controller = createController();

  controller.handleRangeChange({
    startDate: proposal.target.after.startDate,
    endDate: proposal.target.after.endDate,
  });
  try {
    await settled(previewStarted.promise);
    expect(fetchMock).toHaveBeenCalledOnce();
    controller.handleSelectPeriod({ periodId: successorPeriod.id });
    await settled(executions[1]);
    expect(controller.selectedPeriodId).toBe(successorPeriod.id);
  } finally {
    previewResponse.resolve(jsonResponse(confirmationBody, 409));
    await settled(executions[0]);
  }
  expect(controller.range.saving).toBe(false);

  expect(controller.periodUpdateProposal).toBeNull();
  expect(controller.summary).toEqual(selectedSummary);
});

it("ignores a preview superseded by a newer save request", async () => {
  const stalePreview = Promise.withResolvers<Response>();
  const firstStarted = Promise.withResolvers<void>();
  const secondStarted = Promise.withResolvers<void>();
  const newerResponse = Promise.withResolvers<Response>();
  let putCount = 0;
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method === "PUT") {
      putCount += 1;
      if (putCount === 1) {
        firstStarted.resolve();
        return stalePreview.promise;
      }
      secondStarted.resolve();
      return newerResponse.promise;
    }
    if (method === "GET" && url === "/api/periods") {
      return Promise.resolve(
        jsonResponse({ periods: [targetPeriod, successorPeriod] }),
      );
    }
    if (method === "GET" && url.endsWith(`/${targetPeriod.id}`)) {
      return Promise.resolve(jsonResponse(createSummary(0)));
    }
    throw new Error(`Unexpected fetch: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  const revision = createPeriodSummaryRevision();
  const summaryRequests = createPeriodSummaryRequestTracker(revision);
  const confirmationState = createPeriodUpdateConfirmationState({
    getSelectedPeriodId: () => targetPeriod.id,
    summaryRevision: revision,
  });
  let summary = createSummary(0);
  const saving = { budget: false, range: false };
  const errors: Record<"budget" | "range", string | null> = {
    budget: null,
    range: null,
  };
  function publishSummary(next: PeriodSummary): void {
    revision.publish(next, (value) => {
      summary = value;
    });
  }
  function refreshSummaryEffect(periodId: string) {
    const request = summaryRequests.start(periodId);
    return fetchJsonEffect<PeriodSummary>(
      `/api/periods/${periodId}`,
      undefined,
      "再取得に失敗しました。",
    ).pipe(
      Effect.match({
        onFailure: (message) => {
          if (summaryRequests.isFresh(request)) errors.budget = message;
        },
        onSuccess: (next) => {
          if (summaryRequests.isFresh(request)) publishSummary(next);
        },
      }),
    );
  }
  const update = createPeriodUpdateEffect({
    confirmationState,
    getSelectedPeriodId: () => targetPeriod.id,
    getSummary: () => summary,
    getSummaryLoading: () => false,
    publishSummary,
    refreshPeriodListEffect: () =>
      fetchJsonEffect("/api/periods", undefined, "保存に失敗しました。").pipe(
        Effect.flatMap(() => refreshSummaryEffect(targetPeriod.id)),
      ),
    refreshSummaryEffect,
    setError: (message, operation = "range") => {
      errors[operation] = message;
    },
    setSaving: (value, operation = "range") => {
      saving[operation] = value;
    },
    summaryRequests,
    summaryRevision: revision,
  });
  // Public submissions now reject duplicates. Exercise supersession at the
  // existing update Effect seam without replacing its queue or request tracker.
  const first = Effect.runPromise(
    update(
      {
        budgetYen: proposal.target.after.budgetYen,
        startDate: proposal.target.after.startDate,
        endDate: proposal.target.after.endDate,
      },
      "range",
    ),
  );
  let second: Promise<void> | undefined;
  try {
    await settled(firstStarted.promise);
    expect(fetchMock).toHaveBeenCalledOnce();
    second = Effect.runPromise(
      update(
        {
          budgetYen: 11_000,
          startDate: targetPeriod.startDate,
          endDate: targetPeriod.endDate,
        },
        "budget",
      ),
    );
    stalePreview.resolve(jsonResponse(confirmationBody, 409));
    await settled(first);
    await settled(secondStarted.promise);
    expect(confirmationState.pending?.proposal ?? null).toBeNull();
    expect(saving.range).toBe(false);
    expect(saving.budget).toBe(true);
    expect(errors.budget).toBeNull();
  } finally {
    stalePreview.resolve(jsonResponse(confirmationBody, 409));
    newerResponse.resolve(
      jsonResponse(
        {
          error: { code: "INVALID_PERIOD_RANGE", message: "invalid" },
        },
        400,
      ),
    );
    await settled(first);
    if (second != null) await settled(second);
  }
  expect(putCount).toBe(2);
  expect(confirmationState.pending?.proposal ?? null).toBeNull();
  expect(errors.budget).toBe("invalid");
  expect(errors.range).toBeNull();
  expect(saving).toEqual({ budget: false, range: false });
});

it.each(["list", "summary", "saved-list"])(
  "retries %s failure with GET only and preserves budget draft",
  async (failure) => {
    let puts = 0;
    let fail = true;
    const saved = failure === "saved-list";
    const latest = saved
      ? updatedTargetSummary()
      : { ...createSummary(0), endDate: "2026-07-12" };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const list = String(input) === "/api/periods";
      if (init?.method === "PUT") {
        puts++;
        return Promise.resolve(
          puts === 1
            ? jsonResponse(confirmationBody, 409)
            : saved
              ? jsonResponse(latest)
              : jsonResponse(
                  {
                    error: {
                      code: "PERIOD_UPDATE_CONFLICT",
                      message: "変更されました。",
                    },
                  },
                  409,
                ),
        );
      }
      if (fail && list === (failure !== "summary"))
        return Promise.resolve(
          jsonResponse({ error: { message: "再取得エラー" } }, 500),
        );
      return Promise.resolve(
        jsonResponse(
          list ? { periods: [targetPeriod, successorPeriod] } : latest,
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const controller = createController();
    controller.budget.draft = "13000";
    controller.handleRangeChange(proposal.target.after);
    await settled(executions[0]);
    controller.confirmPeriodUpdate();
    await settled(executions[1]);
    expect(controller.confirmation.result?.kind).toBe("error");
    expect(controller.confirmation.recovery?.saved).toBe(saved);
    expect(controller.periodUpdateProposal).toBeNull();
    controller.refreshPeriodConfirmation();
    controller.refreshPeriodConfirmation();
    await settled(Promise.all(executions));
    expect(controller.confirmation.result?.kind).toBe("error");
    fail = false;
    controller.refreshPeriodConfirmation();
    await settled(Promise.all(executions));
    expect(controller.confirmation.result?.kind).toBe(
      saved ? "saved" : "reedit",
    );
    expect(controller.confirmation.recovery).toBeNull();
    expect(controller.range.draft).toEqual({
      startDate: latest.startDate,
      endDate: latest.endDate,
    });
    expect(controller.range.dirty).toBe(false);
    expect(controller.budget.draft).toBe("13000");
    expect(puts).toBe(2);
  },
);

it.each([
  "wrong-id",
  "revision",
  "selection",
  "list-revision",
  "list-selection",
])(
  "drops %s recovery completion without feedback or draft reset",
  async (change) => {
    const held = Promise.withResolvers<Response>();
    const started = Promise.withResolvers<void>();
    const revision = createPeriodSummaryRevision();
    let puts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PUT")
          return Promise.resolve(
            ++puts === 1
              ? jsonResponse(confirmationBody, 409)
              : jsonResponse(
                  {
                    error: { code: "PERIOD_UPDATE_CONFLICT", message: "競合" },
                  },
                  409,
                ),
          );
        if (String(input) === "/api/periods" && change.startsWith("list-")) {
          started.resolve();
          return held.promise;
        }
        if (String(input) === "/api/periods")
          return Promise.resolve(
            jsonResponse({ periods: [targetPeriod, successorPeriod] }),
          );
        if (String(input).endsWith(successorPeriod.id))
          return Promise.resolve(
            jsonResponse(forPeriod(createSummary(0), successorPeriod.id)),
          );
        started.resolve();
        return held.promise;
      }),
    );
    const controller = createController(revision);
    controller.handleRangeChange(proposal.target.after);
    await settled(executions[0]);
    controller.confirmPeriodUpdate();
    await settled(started.promise);
    if (change.endsWith("revision")) revision.advance(targetPeriod.id);
    if (change.endsWith("selection")) {
      controller.handleSelectPeriod({ periodId: successorPeriod.id });
      await settled(executions[2]);
    }
    const draft = { ...controller.range.draft };
    held.resolve(
      jsonResponse(
        change.startsWith("list-")
          ? { periods: [targetPeriod, successorPeriod] }
          : change === "wrong-id"
            ? forPeriod(createSummary(0), successorPeriod.id)
            : createSummary(0),
      ),
    );
    await settled(executions[1]);
    expect(controller.confirmation.result).toBeNull();
    expect(controller.range.draft).toEqual(draft);
    expect(controller.confirmation.refreshing).toBe(false);
  },
);

it("does not release a new confirmation lock when an old recovery GET settles", async () => {
  const oldList = Promise.withResolvers<Response>();
  const retryStarted = Promise.withResolvers<void>();
  const newConfirm = Promise.withResolvers<Response>();
  const confirmStarted = Promise.withResolvers<void>();
  let puts = 0;
  let lists = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") {
        puts++;
        if (puts === 1 || puts === 3)
          return Promise.resolve(jsonResponse(confirmationBody, 409));
        if (puts === 2)
          return Promise.resolve(
            jsonResponse(
              { error: { code: "PERIOD_UPDATE_CONFLICT", message: "競合" } },
              409,
            ),
          );
        confirmStarted.resolve();
        return newConfirm.promise;
      }
      if (String(input) === "/api/periods") {
        lists++;
        if (lists === 1)
          return Promise.resolve(
            jsonResponse({ error: { message: "再取得失敗" } }, 500),
          );
        if (lists === 2) {
          retryStarted.resolve();
          return oldList.promise;
        }
        return Promise.resolve(
          jsonResponse({ periods: [targetPeriod, successorPeriod] }),
        );
      }
      return Promise.resolve(jsonResponse(createSummary(0)));
    }),
  );
  const controller = createController();
  controller.handleRangeChange(proposal.target.after);
  await settled(executions[0]);
  controller.confirmPeriodUpdate();
  await settled(executions[1]);
  controller.refreshPeriodConfirmation();
  await settled(retryStarted.promise);
  controller.handleSelectPeriod({ periodId: targetPeriod.id });
  await settled(executions[3]);
  controller.handleRangeChange(proposal.target.after);
  await settled(executions[4]);
  controller.confirmPeriodUpdate();
  await settled(confirmStarted.promise);
  try {
    oldList.resolve(jsonResponse({ periods: [targetPeriod, successorPeriod] }));
    await settled(executions[2]);
    expect(controller.confirmSaving).toBe(true);
    controller.cancelPeriodUpdateConfirmation();
    expect(controller.periodUpdateProposal).toEqual(proposal);
  } finally {
    newConfirm.resolve(jsonResponse(updatedTargetSummary()));
    await settled(executions[5]);
  }
});
