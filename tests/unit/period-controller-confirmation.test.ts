import { afterEach, expect, it, vi } from "vitest";
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

afterEach(() => {
  vi.unstubAllGlobals();
});

registerPeriodUpdateApiParserTests();

it("opens, confirms once, and reconciles both period revisions", async () => {
  const confirmResponse = Promise.withResolvers<Response>();
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
  await vi.waitFor(() =>
    expect(controller.periodUpdateProposal).toEqual(proposal),
  );
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(controller.periodSaving).toBe(false);
  expect(controller.periodInteractionDisabled).toBe(true);
  expect(revision.getMutationSequence(targetPeriod.id)).toBe(0);

  controller.confirmPeriodUpdate();
  controller.confirmPeriodUpdate();
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(controller.confirmSaving).toBe(true);
  expect(controller.periodInteractionDisabled).toBe(true);
  expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
    budgetYen: proposal.target.after.budgetYen,
    confirmation: proposal,
    endDate: proposal.target.after.endDate,
    startDate: proposal.target.after.startDate,
  });

  confirmResponse.resolve(jsonResponse(summary));
  await vi.waitFor(() => expect(controller.confirmSaving).toBe(false));

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
  await vi.waitFor(() =>
    expect(controller.periodUpdateProposal).toEqual(proposal),
  );
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
  await vi.waitFor(() =>
    expect(controller.periodUpdateProposal).toEqual(proposal),
  );
  revision.advance(successorPeriod.id);

  expect(controller.periodUpdateProposal).toBeNull();
  expect(fetchMock).toHaveBeenCalledOnce();

  controller.handleRangeChange({
    startDate: proposal.target.after.startDate,
    endDate: proposal.target.after.endDate,
  });
  await vi.waitFor(() =>
    expect(controller.periodUpdateProposal).toEqual(proposal),
  );
  controller.confirmPeriodUpdate();
  await vi.waitFor(() => expect(controller.confirmSaving).toBe(false));

  expect(controller.periodUpdateProposal).toBeNull();
  expect(controller.periodError).toBe(conflictMessage);
  expect(controller.summary).toEqual(authoritativeSummary);
  expect(requestOrder.slice(-3)).toEqual([
    `PUT /api/periods/${targetPeriod.id}`,
    "GET /api/periods",
    `GET /api/periods/${targetPeriod.id}`,
  ]);
});

it("ignores a preview that settles after selection changes", async () => {
  const previewResponse = Promise.withResolvers<Response>();
  const selectedSummary = forPeriod(createSummary(0), successorPeriod.id);
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method === "PUT") return previewResponse.promise;
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
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  controller.handleSelectPeriod({ periodId: successorPeriod.id });
  await vi.waitFor(() =>
    expect(controller.selectedPeriodId).toBe(successorPeriod.id),
  );
  previewResponse.resolve(jsonResponse(confirmationBody, 409));
  await vi.waitFor(() => expect(controller.periodSaving).toBe(false));

  expect(controller.periodUpdateProposal).toBeNull();
  expect(controller.summary).toEqual(selectedSummary);
});

it("ignores a preview superseded by a newer save request", async () => {
  const stalePreview = Promise.withResolvers<Response>();
  let putCount = 0;
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method === "PUT") {
      putCount += 1;
      return putCount === 1
        ? stalePreview.promise
        : Promise.resolve(
            jsonResponse(
              { error: { code: "INVALID_PERIOD_RANGE", message: "invalid" } },
              400,
            ),
          );
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
  const controller = createController();

  controller.handleRangeChange({
    startDate: proposal.target.after.startDate,
    endDate: proposal.target.after.endDate,
  });
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  controller.handleSavePeriod({ budgetYen: 11_000 });
  stalePreview.resolve(jsonResponse(confirmationBody, 409));
  await vi.waitFor(() => expect(controller.periodSaving).toBe(false));

  expect(putCount).toBe(2);
  expect(controller.periodUpdateProposal).toBeNull();
  expect(controller.periodError).toBe("invalid");
});
