import { Effect } from "effect";
import { expect, it, vi } from "vitest";
import { fetchJsonEffect } from "$lib/dashboard/fetch-json";
import { createPeriodUpdateEffect } from "$lib/dashboard/period-controller-update-effect";
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

  controller.confirmPeriodUpdate();
  controller.confirmPeriodUpdate();
  try {
    await settled(confirmStarted.promise);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(controller.confirmSaving).toBe(true);
    expect(controller.periodInteractionDisabled).toBe(true);
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
  expect(revision.get(targetPeriod.id)).toBeGreaterThan(0);
  expect(revision.get(successorPeriod.id)).toBeGreaterThan(0);
});

it("cancels without confirming and restores authoritative range inputs", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(jsonResponse(confirmationBody, 409));
  vi.stubGlobal("fetch", fetchMock);
  const controller = createController();

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
});

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
  expect(controller.range.serverError).toBe(conflictMessage);
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
