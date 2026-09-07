import { expect, it, vi } from "vitest";
import {
  captureClientEffects,
  settled,
} from "./period-controller-effect-fixture";
import { createDashboardPageController } from "$lib/dashboard/page-controller.svelte";
import { createPeriodControllerState } from "$lib/dashboard/period-controller-state.svelte";
import { createPeriodSummaryRevision } from "$lib/dashboard/period-summary-revision";
import { createSummary } from "./day-entry-controller-test-fixtures";
import { jsonResponse } from "./day-entry-controller-test-fixtures";

const executions = captureClientEffects();
const period = {
  id: "period-1",
  startDate: "2026-09-01",
  endDate: "2026-09-30",
  budgetYen: 120_000,
  status: "active" as const,
  predecessorPeriodId: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

const createdPeriod = {
  ...period,
  id: "period-3",
  startDate: "2026-10-01",
  endDate: "2026-10-30",
};

const createdSummary = {
  ...createSummary(0),
  periodId: createdPeriod.id,
  startDate: createdPeriod.startDate,
  endDate: createdPeriod.endDate,
};

function createController() {
  return createDashboardPageController(() => ({
    today: period.startDate,
    periods: [period],
    selectedPeriodId: period.id,
    summary: {
      ...createSummary(0),
      periodId: period.id,
      startDate: period.startDate,
      endDate: period.endDate,
      budgetYen: period.budgetYen,
    },
  }));
}

it("preserves edited create ID when applying a create range", () => {
  const controller = createController();
  const automatic = createController();

  controller.createPeriodId = "p-custom";
  controller.updateCreatePeriodRange({
    startDate: "2026-10-01",
    endDate: "2026-10-30",
  });
  expect(controller.createPeriodId).toBe("p-custom");
  controller.createPeriodId = "p-2026-09-01";
  controller.updateCreatePeriodRange({
    startDate: "2026-11-01",
    endDate: "2026-11-30",
  });
  automatic.updateCreatePeriodRange({
    startDate: "2026-10-01",
    endDate: "2026-10-30",
  });

  expect(controller.createPeriodId).toBe("p-2026-09-01");
  expect(automatic.createPeriodId).toBe("p-2026-10-01");
  expect(controller.createSaving).toBe(false);
  expect(controller.createError).toBeNull();
  expect(controller.createdPeriodId).toBeNull();
  expect(controller.createdRefreshPending).toBe(false);
});

it("rejects invalid create budget without changing settings state", async () => {
  const controller = createController();
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  controller.createBudgetInput = "1000abc";
  controller.createInitialPeriod();
  await settled(executions[0]);

  expect(fetchMock).not.toHaveBeenCalled();
  expect(controller.createBudgetInput).toBe("1000abc");
  expect(controller.createError).not.toBeNull();
  expect(controller.createSaving).toBe(false);
  expect(controller.periodError).toBe(controller.createError);
  expect(controller.budget).toMatchObject({
    saving: false,
    validationError: null,
    serverError: null,
  });
  expect(controller.range).toMatchObject({
    saving: false,
    serverError: null,
    validationErrors: { startDate: null, endDate: null, range: null },
  });
});

it("retries created period with GET only", async () => {
  let createdSummaryRequests = 0;
  const requests: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      requests.push(`${method} ${url}`);
      if (method === "POST") {
        return Promise.resolve(jsonResponse({ id: createdPeriod.id }));
      }
      if (url === "/api/periods") {
        return Promise.resolve(
          jsonResponse({ periods: [period, createdPeriod] }),
        );
      }
      if (url === `/api/periods/${createdPeriod.id}`) {
        createdSummaryRequests += 1;
        return Promise.resolve(
          createdSummaryRequests === 1
            ? jsonResponse({ error: { message: "summary unavailable" } }, 503)
            : jsonResponse(createdSummary),
        );
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    }),
  );
  const controller = createController();

  controller.createInitialPeriod();
  await settled(executions[0]);
  expect(controller.createdPeriodId).toBe(createdPeriod.id);
  expect(controller.createdRefreshPending).toBe(true);
  expect(controller.createSaving).toBe(false);
  expect(controller.createError).toBe("summary unavailable");
  expect(controller.selectedPeriodId).toBe(period.id);

  controller.createPeriodId = "p-edited-after-post";
  expect(controller.createError).toBeNull();
  controller.refreshCreatedPeriod();
  await settled(executions[1]);

  expect(
    requests.filter((request) => request.startsWith("POST ")),
  ).toHaveLength(1);
  expect(
    requests.filter((request) => request === "GET /api/periods"),
  ).toHaveLength(2);
  expect(controller.createPeriodId).toBe("p-edited-after-post");
  expect(controller.createdPeriodId).toBe(createdPeriod.id);
  expect(controller.createdRefreshPending).toBe(false);
  expect(controller.createError).toBeNull();
  expect(controller.selectedPeriodId).toBe(createdPeriod.id);
  expect(controller.summary).toEqual(createdSummary);
  expect(controller.budget.draft).toBe(String(createdSummary.budgetYen));

  controller.updateCreatePeriodRange({
    startDate: "2026-11-01",
    endDate: "2026-11-30",
  });
  expect(controller.createdPeriodId).toBeNull();
  expect(controller.createdRefreshPending).toBe(false);
  expect(controller.createPeriodId).toBe("p-edited-after-post");
});

it.each(["list", "missing", "summary", "mismatch"] as const)(
  "retains recovery on GET failure: %s",
  async (failure) => {
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        requests.push(`${method} ${url}`);
        if (method === "POST") {
          return Promise.resolve(jsonResponse({ id: createdPeriod.id }));
        }
        if (url === "/api/periods") {
          if (failure === "list") {
            return Promise.resolve(
              jsonResponse({ error: { message: "list unavailable" } }, 503),
            );
          }
          return Promise.resolve(
            jsonResponse({
              periods:
                failure === "missing" ? [period] : [period, createdPeriod],
            }),
          );
        }
        if (url === `/api/periods/${createdPeriod.id}`) {
          return Promise.resolve(
            failure === "mismatch"
              ? jsonResponse({ ...createdSummary, periodId: period.id })
              : jsonResponse(
                  { error: { message: "summary unavailable" } },
                  503,
                ),
          );
        }
        if (url === `/api/periods/${period.id}`) {
          return Promise.resolve(jsonResponse(createSummary(0)));
        }
        throw new Error(`Unexpected fetch: ${method} ${url}`);
      }),
    );
    const controller = createController();
    controller.budget.draft = "130000";
    controller.range.edit({
      startDate: period.startDate,
      endDate: "2026-09-29",
    });

    controller.createInitialPeriod();
    await settled(executions[0]);
    controller.createBudgetInput = "140000";
    controller.refreshCreatedPeriod();
    await settled(executions[1]);

    expect(
      requests.filter((request) => request.startsWith("POST ")),
    ).toHaveLength(1);
    expect(controller.createdPeriodId).toBe(createdPeriod.id);
    expect(controller.createdRefreshPending).toBe(true);
    expect(controller.createBudgetInput).toBe("140000");
    expect(controller.selectedPeriodId).toBe(period.id);
    expect(controller.summary?.periodId).toBe(period.id);
    expect(controller.createError).not.toBeNull();
    expect(controller.summaryError).toBeNull();
    expect(controller.budget).toMatchObject({
      draft: "130000",
      serverError: null,
      success: false,
    });
    expect(controller.range).toMatchObject({
      serverError: null,
      success: false,
    });
    expect(controller.periodUpdateProposal).toBeNull();

    controller.handleSelectPeriod({ periodId: period.id });
    await settled(executions[2]);
    expect(controller.createError).toBeNull();
    expect(controller.createdPeriodId).toBe(createdPeriod.id);
    expect(controller.createdRefreshPending).toBe(true);
  },
);

it("publishes a created period from an empty state", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") {
        return Promise.resolve(jsonResponse({ id: createdPeriod.id }));
      }
      if (url === "/api/periods") {
        return Promise.resolve(jsonResponse({ periods: [createdPeriod] }));
      }
      if (url === `/api/periods/${createdPeriod.id}`) {
        return Promise.resolve(jsonResponse(createdSummary));
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }),
  );
  const controller = createDashboardPageController(() => ({
    today: period.startDate,
    periods: [],
    selectedPeriodId: null,
    summary: null,
  }));

  controller.createInitialPeriod();
  await settled(executions[0]);

  expect(controller.selectedPeriodId).toBe(createdPeriod.id);
  expect(controller.summary).toEqual(createdSummary);
  expect(controller.createdPeriodId).toBe(createdPeriod.id);
  expect(controller.createdRefreshPending).toBe(false);
  expect(controller.createSaving).toBe(false);
  expect(controller.createError).toBeNull();
});

it("waits for an active created-period mutation before recovery", async () => {
  const postStarted = Promise.withResolvers<void>();
  const postResponse = Promise.withResolvers<Response>();
  const mutationWaitStarted = Promise.withResolvers<void>();
  const requests: string[] = [];
  const revision = createPeriodSummaryRevision();
  const awaitMutationSettlement =
    revision.awaitMutationSettlement.bind(revision);
  vi.spyOn(revision, "awaitMutationSettlement").mockImplementation(
    (periodId, sequence) => {
      mutationWaitStarted.resolve();
      return awaitMutationSettlement(periodId, sequence);
    },
  );
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      requests.push(`${method} ${url}`);
      if (method === "POST") {
        postStarted.resolve();
        return postResponse.promise;
      }
      if (url === "/api/periods") {
        return Promise.resolve(
          jsonResponse({ periods: [period, createdPeriod] }),
        );
      }
      if (url === `/api/periods/${createdPeriod.id}`) {
        return Promise.resolve(jsonResponse(createdSummary));
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    }),
  );
  const controller = createPeriodControllerState(
    {
      today: period.startDate,
      periods: [period],
      selectedPeriodId: period.id,
      summary: {
        ...createSummary(0),
        periodId: period.id,
        startDate: period.startDate,
        endDate: period.endDate,
        budgetYen: period.budgetYen,
      },
    },
    revision,
  );

  controller.createInitialPeriod();
  await settled(postStarted.promise);
  const mutationSequence = revision.beginMutation(createdPeriod.id);
  postResponse.resolve(jsonResponse({ id: createdPeriod.id }));
  await settled(mutationWaitStarted.promise);
  expect(requests).toEqual(["POST /api/periods"]);
  revision.completeMutation(createdPeriod.id, mutationSequence);
  await settled(executions[0]);

  expect(requests).toEqual([
    "POST /api/periods",
    "GET /api/periods",
    `GET /api/periods/${createdPeriod.id}`,
  ]);
  expect(controller.selectedPeriodId).toBe(createdPeriod.id);
  expect(controller.createdRefreshPending).toBe(false);
});

it("guards create submission during POST and allows resubmission after POST failure", async () => {
  const firstPost = Promise.withResolvers<Response>();
  let postCount = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method !== "POST") throw new Error("Unexpected GET");
      postCount += 1;
      return postCount === 1
        ? firstPost.promise
        : Promise.resolve(
            jsonResponse({ error: { message: "second failure" } }, 503),
          );
    }),
  );
  const controller = createController();

  controller.createInitialPeriod();
  controller.createInitialPeriod();
  expect(postCount).toBe(1);
  expect(controller.createSaving).toBe(true);
  firstPost.resolve(jsonResponse({ error: { message: "first failure" } }, 503));
  await settled(executions[0]);
  expect(controller.createdPeriodId).toBeNull();
  expect(controller.createdRefreshPending).toBe(false);
  expect(controller.createError).toBe("first failure");

  controller.createInitialPeriod();
  await settled(executions[1]);
  expect(postCount).toBe(2);
  expect(controller.createError).toBe("second failure");
});

it("guards create submission through GET and pending recovery", async () => {
  const listStarted = Promise.withResolvers<void>();
  const listResponse = Promise.withResolvers<Response>();
  const requests: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      requests.push(`${method} ${url}`);
      if (method === "POST") {
        return Promise.resolve(jsonResponse({ id: createdPeriod.id }));
      }
      if (url === "/api/periods") {
        listStarted.resolve();
        return listResponse.promise;
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    }),
  );
  const controller = createController();

  controller.createInitialPeriod();
  try {
    await settled(listStarted.promise);
    expect(controller.createSaving).toBe(false);
    expect(controller.periodSaving).toBe(true);
    expect(controller.createdPeriodId).toBe(createdPeriod.id);
    expect(controller.createdRefreshPending).toBe(true);
    controller.createInitialPeriod();
    controller.refreshCreatedPeriod();
    expect(executions).toHaveLength(1);
  } finally {
    listResponse.resolve(
      jsonResponse({ error: { message: "list unavailable" } }, 503),
    );
    await settled(executions[0]);
  }
  controller.createInitialPeriod();
  expect(executions).toHaveLength(1);
  expect(requests).toEqual(["POST /api/periods", "GET /api/periods"]);
});

it("does not retry recovery while other period management is busy", async () => {
  const updateStarted = Promise.withResolvers<void>();
  const updateResponse = Promise.withResolvers<Response>();
  const requests: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      requests.push(`${method} ${url}`);
      if (method === "POST") {
        return Promise.resolve(jsonResponse({ id: createdPeriod.id }));
      }
      if (method === "PUT") {
        updateStarted.resolve();
        return updateResponse.promise;
      }
      if (url === "/api/periods") {
        return Promise.resolve(
          jsonResponse({ error: { message: "list unavailable" } }, 503),
        );
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    }),
  );
  const controller = createController();

  controller.createInitialPeriod();
  await settled(executions[0]);
  expect(controller.createdRefreshPending).toBe(true);
  controller.handleSavePeriod({ budgetYen: 130_000 });
  try {
    await settled(updateStarted.promise);
    controller.refreshCreatedPeriod();
    expect(executions).toHaveLength(2);
    expect(
      requests.filter((request) => request === "GET /api/periods"),
    ).toHaveLength(1);
  } finally {
    updateResponse.resolve(
      jsonResponse({
        ...createSummary(0),
        periodId: period.id,
        startDate: period.startDate,
        endDate: period.endDate,
        budgetYen: 130_000,
      }),
    );
    await settled(executions[1]);
  }
  expect(controller.createdRefreshPending).toBe(true);
});

it("rejects superseded create results and permits an explicit fresh retry", async () => {
  const postStarted = Promise.withResolvers<void>();
  const postResponse = Promise.withResolvers<Response>();
  const requests: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      requests.push(`${method} ${url}`);
      if (method === "POST") {
        postStarted.resolve();
        return postResponse.promise;
      }
      if (url === "/api/periods") {
        return Promise.resolve(
          jsonResponse({ periods: [period, createdPeriod] }),
        );
      }
      if (url === "/api/periods/period-2") {
        return Promise.resolve(
          jsonResponse({ ...createSummary(0), periodId: "period-2" }),
        );
      }
      if (url === `/api/periods/${createdPeriod.id}`) {
        return Promise.resolve(jsonResponse(createdSummary));
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    }),
  );
  const controller = createController();

  controller.createInitialPeriod();
  await settled(postStarted.promise);
  controller.handleSelectPeriod({ periodId: "period-2" });
  await settled(executions[1]);
  postResponse.resolve(jsonResponse({ id: createdPeriod.id }));
  await settled(executions[0]);

  expect(controller.selectedPeriodId).toBe("period-2");
  expect(controller.createdPeriodId).toBe(createdPeriod.id);
  expect(controller.createdRefreshPending).toBe(true);
  expect(requests).not.toContain("GET /api/periods");
  controller.refreshCreatedPeriod();
  await settled(executions[2]);
  expect(controller.selectedPeriodId).toBe(createdPeriod.id);
  expect(controller.createdRefreshPending).toBe(false);
});

it("rejects superseded create results after an A to B to A selection", async () => {
  const postStarted = Promise.withResolvers<void>();
  const postResponse = Promise.withResolvers<Response>();
  const requests: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      requests.push(`${method} ${url}`);
      if (method === "POST") {
        postStarted.resolve();
        return postResponse.promise;
      }
      if (url === "/api/periods/period-2") {
        return Promise.resolve(
          jsonResponse({ ...createSummary(0), periodId: "period-2" }),
        );
      }
      if (url === `/api/periods/${period.id}`) {
        return Promise.resolve(jsonResponse(createSummary(0)));
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    }),
  );
  const controller = createController();

  controller.createInitialPeriod();
  await settled(postStarted.promise);
  controller.handleSelectPeriod({ periodId: "period-2" });
  await settled(executions[1]);
  controller.handleSelectPeriod({ periodId: period.id });
  await settled(executions[2]);
  postResponse.resolve(jsonResponse({ id: createdPeriod.id }));
  await settled(executions[0]);

  expect(controller.selectedPeriodId).toBe(period.id);
  expect(controller.createdPeriodId).toBe(createdPeriod.id);
  expect(controller.createdRefreshPending).toBe(true);
  expect(requests).not.toContain("GET /api/periods");
});
