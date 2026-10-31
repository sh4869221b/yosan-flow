import { afterEach, expect, it, vi } from "vitest";
import { createPeriodControllerState } from "#lib/dashboard/period-controller-state.svelte.ts";
import { createPeriodSummaryRevision } from "#lib/dashboard/period-summary-revision.ts";
import type { PeriodOption } from "#lib/dashboard/controller-types.ts";
import {
  captureClientEffects,
  settled,
} from "./period-controller-effect-fixture";
import {
  createSummary,
  jsonResponse,
} from "./day-entry-controller-test-fixtures";

const executions = captureClientEffects();
afterEach(() => vi.useRealTimers());

function option(id: string, startDate: string, endDate: string): PeriodOption {
  return {
    id,
    startDate,
    endDate,
    budgetYen: 10_000,
    status: "active",
    predecessorPeriodId: null,
    createdAt: `${startDate}T00:00:00.000Z`,
    updatedAt: `${startDate}T00:00:00.000Z`,
  };
}
const original = option("period-1", "2026-07-12", "2026-07-13");
const future = option("future", "2026-10-10", "2026-10-11");

function summaryFor(period: PeriodOption, usedYen = 0) {
  return {
    ...createSummary(usedYen),
    periodId: period.id,
    startDate: period.startDate,
    endDate: period.endDate,
    budgetYen: period.budgetYen,
    status: period.status,
  };
}
function controllerFor(
  periods: PeriodOption[] = [original],
  selected: PeriodOption | null = original,
  revision = createPeriodSummaryRevision(),
  onPeriodChanged = vi.fn(),
) {
  const data =
    selected == null
      ? { today: "2026-07-12", periods, selectedPeriodId: null, summary: null }
      : {
          today: "2026-07-12",
          periods,
          selectedPeriodId: selected.id,
          summary: summaryFor(selected),
        };
  return createPeriodControllerState(data, revision, onPeriodChanged);
}

it("adds newly discovered periods while keeping the selected period and dirty settings", async () => {
  const summaryStarted = Promise.withResolvers<void>();
  const summaryResponse = Promise.withResolvers<Response>();
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url === "/api/periods")
        return Promise.resolve(jsonResponse({ periods: [original, future] }));
      summaryStarted.resolve();
      return summaryResponse.promise;
    }),
  );
  const controller = controllerFor();
  controller.budget.draft = "15000";
  controller.range.edit({
    startDate: original.startDate,
    endDate: "2026-07-14",
  });
  const complete = vi.fn();
  controller.refreshOnResume(complete);
  try {
    await settled(summaryStarted.promise);
    expect(controller.periods).toEqual([original, future]);
    expect(controller.selectedPeriodId).toBe(original.id);
    expect(controller.summaryLoading).toBe(false);
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/periods/period-1",
      expect.objectContaining({ cache: "no-store" }),
    );
  } finally {
    summaryResponse.resolve(jsonResponse(summaryFor(original, 2_000)));
    await settled(executions[0]);
  }
  expect(controller.summary?.spentToDateYen).toBe(2_000);
  expect(controller.budget.draft).toBe("15000");
  expect(controller.range.draft.endDate).toBe("2026-07-14");
  expect(complete).toHaveBeenCalledOnce();
});

it.each([false, true])(
  "selects the active JST period when the previous selection is unavailable (previously selected: %s)",
  async (previouslySelected) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-08T15:15:00.000Z"));
    const current = option("current", "2026-10-09", "2026-10-09");
    const closed = { ...current, id: "closed", status: "closed" as const };
    const periods = [closed, current, future];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        Promise.resolve(
          jsonResponse(
            url === "/api/periods" ? { periods } : summaryFor(current),
          ),
        ),
      ),
    );
    const changed = vi.fn();
    const controller = controllerFor(
      previouslySelected ? [original] : [],
      previouslySelected ? original : null,
      createPeriodSummaryRevision(),
      changed,
    );
    controller.refreshOnResume(vi.fn());
    await settled(executions[0]);

    expect(controller.periods).toEqual(periods);
    expect(controller.selectedPeriodId).toBe(current.id);
    expect(controller.summary?.periodId).toBe(current.id);
    expect(controller.summaryLoading).toBe(false);
    expect(changed).toHaveBeenCalledOnce();
  },
);

it("chooses the latest discovered period when none is active today", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-08T00:00:00.000Z"));
  const periods = [original, future];
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ periods }))
    .mockResolvedValueOnce(jsonResponse(summaryFor(future)));
  vi.stubGlobal("fetch", fetchMock);
  const controller = controllerFor([], null);
  controller.refreshOnResume(vi.fn());
  await settled(executions[0]);

  expect(controller.selectedPeriodId).toBe(future.id);
  expect(controller.summary?.periodId).toBe(future.id);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it.each([null, original])(
  "handles an empty refreshed list (selection: %o)",
  async (selected) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ periods: [] })),
    );
    const changed = vi.fn();
    const controller = controllerFor(
      selected == null ? [] : [selected],
      selected,
      createPeriodSummaryRevision(),
      changed,
    );
    const complete = vi.fn();
    controller.refreshOnResume(complete);
    await settled(executions[0]);

    expect(controller.periods).toEqual([]);
    expect(controller.selectedPeriodId).toBeNull();
    expect(controller.summary).toBeNull();
    expect(controller.summaryLoading).toBe(false);
    expect(changed).toHaveBeenCalledTimes(selected == null ? 0 : 1);
    expect(complete).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
  },
);

it("ignores a delayed list after the user selects another period", async () => {
  const pendingList = Promise.withResolvers<Response>();
  const listStarted = Promise.withResolvers<void>();
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url === "/api/periods") {
        listStarted.resolve();
        return pendingList.promise;
      }
      return Promise.resolve(jsonResponse(summaryFor(future, 3_000)));
    }),
  );
  const controller = controllerFor([original, future]);
  const complete = vi.fn();
  controller.refreshOnResume(complete);
  try {
    await settled(listStarted.promise);
    controller.handleSelectPeriod({ periodId: future.id });
    await settled(executions[1]);
  } finally {
    pendingList.resolve(jsonResponse({ periods: [original] }));
    await settled(executions[0]);
  }
  expect(controller.periods).toEqual([original, future]);
  expect(controller.selectedPeriodId).toBe(future.id);
  expect(controller.summary?.spentToDateYen).toBe(3_000);
  expect(complete).toHaveBeenCalledOnce();
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("ignores a delayed list when a spending mutation has begun", async () => {
  const pending = Promise.withResolvers<Response>();
  const started = Promise.withResolvers<void>();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      started.resolve();
      return pending.promise;
    }),
  );
  const revision = createPeriodSummaryRevision();
  const controller = controllerFor([original], original, revision);
  controller.refreshOnResume(vi.fn());
  await settled(started.promise);
  const mutation = revision.beginMutation(original.id);
  pending.resolve(jsonResponse({ periods: [] }));
  await settled(executions[0]);

  expect(controller.periods).toEqual([original]);
  expect(controller.selectedPeriodId).toBe(original.id);
  expect(controller.summary).toEqual(summaryFor(original));
  expect(fetch).toHaveBeenCalledOnce();
  revision.completeMutation(original.id, mutation);
});

it("keeps a period save authoritative when an older resume list arrives later", async () => {
  const oldList = Promise.withResolvers<Response>();
  const started = Promise.withResolvers<void>();
  const saved = { ...original, budgetYen: 12_000 };
  let lists = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url === "/api/periods") {
        if (++lists === 1) {
          started.resolve();
          return oldList.promise;
        }
        return Promise.resolve(jsonResponse({ periods: [saved] }));
      }
      return Promise.resolve(jsonResponse(summaryFor(saved, 2_000)));
    }),
  );
  const controller = controllerFor();
  const complete = vi.fn();
  controller.refreshOnResume(complete);
  try {
    await settled(started.promise);
    controller.budget.draft = String(saved.budgetYen);
    controller.saveBudget();
    await settled(executions[1]);
  } finally {
    oldList.resolve(jsonResponse({ periods: [original, future] }));
    await settled(executions[0]);
  }
  expect(controller.periods).toEqual([saved]);
  expect(controller.selectedPeriodId).toBe(original.id);
  expect(controller.summary).toEqual(summaryFor(saved, 2_000));
  expect(controller.budget.success).toBe(true);
  expect(controller.summaryLoading).toBe(false);
  expect(complete).toHaveBeenCalledOnce();
});

it("waits for an already active mutation before refreshing list and summary", async () => {
  const revision = createPeriodSummaryRevision();
  const mutation = revision.beginMutation(original.id);
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ periods: [original, future] }))
    .mockResolvedValueOnce(jsonResponse(summaryFor(original, 4_000)));
  vi.stubGlobal("fetch", fetchMock);
  const controller = controllerFor([original], original, revision);
  controller.refreshOnResume(vi.fn());
  expect(fetchMock).not.toHaveBeenCalled();
  revision.publish(summaryFor(original, 4_000), controller.setSummary);
  revision.completeMutation(original.id, mutation);
  await settled(executions[0]);

  expect(controller.periods).toEqual([original, future]);
  expect(controller.summary?.spentToDateYen).toBe(4_000);
  expect(controller.summaryLoading).toBe(false);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("keeps creation from an empty dashboard authoritative over an older list", async () => {
  const listStarted = Promise.withResolvers<void>();
  const oldList = Promise.withResolvers<Response>();
  const createResponse = Promise.withResolvers<Response>();
  let lists = 0;
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === "POST") return createResponse.promise;
    if (url === "/api/periods" && ++lists === 1) {
      listStarted.resolve();
      return oldList.promise;
    }
    return Promise.resolve(
      jsonResponse(
        url === "/api/periods" ? { periods: [future] } : summaryFor(future),
      ),
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  const controller = controllerFor([], null);
  controller.createPeriodId = future.id;
  controller.createBudgetInput = String(future.budgetYen);
  controller.updateCreatePeriodRange(future);
  controller.refreshOnResume(vi.fn());
  try {
    await settled(listStarted.promise);
    controller.createInitialPeriod();
    oldList.resolve(jsonResponse({ periods: [original] }));
    await settled(executions[0]);
    expect(controller.periods).toEqual([]);
    expect(controller.selectedPeriodId).toBeNull();
    expect(controller.createSaving).toBe(true);
  } finally {
    oldList.resolve(jsonResponse({ periods: [original] }));
    createResponse.resolve(jsonResponse({ id: future.id }));
    await settled(Promise.all(executions));
  }
  expect(controller.periods).toEqual([future]);
  expect(controller.selectedPeriodId).toBe(future.id);
  expect(controller.createdRefreshPending).toBe(false);
});
