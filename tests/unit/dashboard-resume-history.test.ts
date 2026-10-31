import { Effect } from "effect";
import { expect, it, vi } from "vitest";
import { createDashboardPageController } from "#lib/dashboard/page-controller.svelte.ts";
import { createHistoryControllerState } from "#lib/dashboard/history-controller-state.svelte.ts";
import { createPeriodSummaryRevision } from "#lib/dashboard/period-summary-revision.ts";
import type { HistoryItem } from "#lib/dashboard/types.ts";
import {
  captureClientEffects,
  settled,
} from "./period-controller-effect-fixture";
import {
  createSummary,
  jsonResponse,
} from "./day-entry-controller-test-fixtures";

const executions = captureClientEffects();
const date = "2026-07-12";
const period = {
  id: "period-1",
  startDate: date,
  endDate: "2026-07-13",
  budgetYen: 10_000,
  status: "active" as const,
  predecessorPeriodId: null,
  createdAt: `${date}T00:00:00.000Z`,
  updatedAt: `${date}T00:00:00.000Z`,
};

function history(id: string, inputYen = 500): HistoryItem {
  return {
    id,
    date,
    operationType: "add",
    inputYen,
    beforeTotalYen: 0,
    afterTotalYen: inputYen,
    memo: id,
    createdAt: `${date}T00:00:00.000Z`,
  };
}

function createHarness() {
  const revision = createPeriodSummaryRevision();
  const state = {
    periodId: period.id,
    date,
    open: true,
    summary: createSummary(500),
  };
  const controller = createHistoryControllerState(
    {
      getSelectedDate: () => state.date,
      getSelectedPeriodId: () => state.periodId,
      getModalOpen: () => state.open,
      getSummary: () => state.summary,
      setSelectedRow: vi.fn(),
      setSummary: (summary) => (state.summary = summary),
    },
    revision,
  );
  return { controller, revision, state };
}

it.each([
  ["addition", 2_000, [history("original"), history("added", 1_500)]],
  ["edit", 2_000, [history("original", 2_000)]],
  ["deletion", 0, []],
] as const)(
  "refreshes open modal histories after an external %s without resetting drafts",
  async (_operation, usedYen, currentHistories) => {
    let reads = 0;
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/periods")
        return Promise.resolve(jsonResponse({ periods: [period] }));
      if (url.endsWith("/history")) {
        reads += 1;
        return Promise.resolve(
          jsonResponse({
            histories: reads === 1 ? [history("original")] : currentHistories,
          }),
        );
      }
      return Promise.resolve(jsonResponse(createSummary(usedYen)));
    });
    vi.stubGlobal("fetch", fetchMock);
    const controller = createDashboardPageController(() => ({
      today: date,
      periods: [period],
      selectedPeriodId: period.id,
      summary: createSummary(500),
    }));
    controller.openDayEntry({ date });
    await settled(executions[0]);
    controller.modalInputYen = "777";
    controller.modalMemo = "unfinished draft";
    const complete = Promise.withResolvers<void>();
    controller.refreshOnResume(complete.resolve);
    await settled(complete.promise);

    expect(controller.selectedRow?.usedYen).toBe(usedYen);
    expect(controller.histories).toEqual(currentHistories);
    expect(controller.modalOpen).toBe(true);
    expect(controller.selectedDate).toBe(date);
    expect(controller.modalInputYen).toBe("777");
    expect(controller.modalMemo).toBe("unfinished draft");
    expect(reads).toBe(2);
  },
);

it("keeps existing history rows mounted while a resume read is pending", async () => {
  const pending = Promise.withResolvers<Response>();
  const original = history("original");
  const updated = history("updated");
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ histories: [original] }))
    .mockImplementationOnce(() => pending.promise);
  vi.stubGlobal("fetch", fetchMock);
  const { controller } = createHarness();
  await controller.retryHistory(date);
  const refresh = Effect.runPromise(controller.refreshOnResumeEffect());
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

  expect(controller.historyLoading).toBe(false);
  expect(controller.histories).toEqual([original]);
  pending.resolve(jsonResponse({ histories: [updated] }));
  await settled(refresh);
  expect(controller.histories).toEqual([updated]);
});

it("keeps the initial loading indicator until the newer resume read settles", async () => {
  const initial = Promise.withResolvers<Response>();
  const resumed = Promise.withResolvers<Response>();
  const current = history("current");
  const fetchMock = vi
    .fn()
    .mockImplementationOnce(() => initial.promise)
    .mockImplementationOnce(() => resumed.promise);
  vi.stubGlobal("fetch", fetchMock);
  const { controller } = createHarness();
  const firstRead = controller.retryHistory(date);
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  const refresh = Effect.runPromise(controller.refreshOnResumeEffect());
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

  expect(controller.historyLoading).toBe(true);
  resumed.resolve(jsonResponse({ histories: [current] }));
  await settled(refresh);
  expect(controller.historyLoading).toBe(false);
  initial.resolve(jsonResponse({ histories: [history("old initial read")] }));
  await settled(firstRead);
  expect(controller.histories).toEqual([current]);
});

it.each(["closed", "different date", "different period", "reopened"])(
  "drops a resume history response when its modal is %s",
  async (change) => {
    const pending = Promise.withResolvers<Response>();
    const original = history("original");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ histories: [original] }))
      .mockImplementationOnce(() => pending.promise);
    vi.stubGlobal("fetch", fetchMock);
    const { controller, state } = createHarness();
    await controller.retryHistory(date);
    const refresh = Effect.runPromise(controller.refreshOnResumeEffect());
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    if (change === "closed") state.open = false;
    else if (change === "different date") state.date = "2026-07-13";
    else if (change === "different period") state.periodId = "period-2";
    else {
      state.open = false;
      controller.resetHistories();
      state.open = true;
    }
    pending.resolve(jsonResponse({ histories: [history("stale")] }));
    await settled(refresh);

    expect(controller.histories).toEqual(
      change === "reopened" ? [] : [original],
    );
    expect(controller.historyLoading).toBe(false);
  },
);

it("waits for an active history edit before resuming its history read", async () => {
  const mutation = Promise.withResolvers<Response>();
  const original = history("original");
  const updated = history("original", 2_000);
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ histories: [original] }))
    .mockImplementationOnce(() => mutation.promise)
    .mockResolvedValueOnce(jsonResponse({ histories: [updated] }));
  vi.stubGlobal("fetch", fetchMock);
  const { controller } = createHarness();
  await controller.retryHistory(date);
  const update = controller.updateHistory({
    historyId: original.id,
    inputYen: 2_000,
    memo: "edited",
  });
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  const refresh = Effect.runPromise(controller.refreshOnResumeEffect());

  expect(fetchMock).toHaveBeenCalledTimes(2);
  mutation.resolve(
    jsonResponse({ summary: createSummary(2_000), histories: [updated] }),
  );
  await settled(update);
  await settled(refresh);
  expect(controller.histories).toEqual([updated]);
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

it.each(["closed", "reopened", "newer read"])(
  "abandons a resume waiting for a mutation after the modal has a %s owner",
  async (change) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ histories: [history("newer read")] }));
    vi.stubGlobal("fetch", fetchMock);
    const { controller, revision, state } = createHarness();
    const mutation = revision.beginMutation(period.id);
    const refresh = Effect.runPromise(controller.refreshOnResumeEffect());
    expect(fetchMock).not.toHaveBeenCalled();
    if (change === "closed") state.open = false;
    else if (change === "reopened") controller.resetHistories();
    else await controller.retryHistory(date);
    revision.completeMutation(period.id, mutation);
    await settled(refresh);

    expect(fetchMock).toHaveBeenCalledTimes(change === "newer read" ? 1 : 0);
  },
);

it("does not replace a completed history edit with an older resume read", async () => {
  const pending = Promise.withResolvers<Response>();
  const original = history("original");
  const updated = history("original", 2_000);
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ histories: [original] }))
    .mockImplementationOnce(() => pending.promise)
    .mockResolvedValueOnce(
      jsonResponse({ summary: createSummary(2_000), histories: [updated] }),
    );
  vi.stubGlobal("fetch", fetchMock);
  const { controller } = createHarness();
  await controller.retryHistory(date);
  const refresh = Effect.runPromise(controller.refreshOnResumeEffect());
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  await controller.updateHistory({
    historyId: original.id,
    inputYen: 2_000,
    memo: "edited",
  });
  expect(controller.histories).toEqual([updated]);

  pending.resolve(jsonResponse({ histories: [original] }));
  await settled(refresh);
  expect(controller.histories).toEqual([updated]);
});

it("does not replace a later day save with an older resume history response", async () => {
  const pending = Promise.withResolvers<Response>();
  const original = history("original");
  const saved = history("saved", 2_000);
  let historyReads = 0;
  let usedYen = 500;
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url === "/api/periods")
      return Promise.resolve(jsonResponse({ periods: [period] }));
    if (init?.method === "POST") {
      usedYen = 2_000;
      return Promise.resolve(jsonResponse(createSummary(usedYen)));
    }
    if (url.endsWith("/history")) {
      historyReads += 1;
      if (historyReads === 2) return pending.promise;
      return Promise.resolve(
        jsonResponse({ histories: [historyReads === 1 ? original : saved] }),
      );
    }
    return Promise.resolve(jsonResponse(createSummary(usedYen)));
  });
  vi.stubGlobal("fetch", fetchMock);
  const controller = createDashboardPageController(() => ({
    today: date,
    periods: [period],
    selectedPeriodId: period.id,
    summary: createSummary(500),
  }));
  controller.openDayEntry({ date });
  await settled(executions[0]);
  const complete = Promise.withResolvers<void>();
  controller.refreshOnResume(complete.resolve);
  await vi.waitFor(() => expect(historyReads).toBe(2));
  controller.submitDayEntry({ date, inputYen: 1_500, memo: "saved" });
  await vi.waitFor(() => expect(controller.histories).toEqual([saved]));
  expect(controller.modalOpen).toBe(false);
  pending.resolve(jsonResponse({ histories: [original] }));
  await settled(complete.promise);

  expect(controller.histories).toEqual([saved]);
  expect(controller.summary?.dailyRows[0].usedYen).toBe(2_000);
});

it("keeps an unrelated day publication from invalidating the current day's resume read", async () => {
  const pending = Promise.withResolvers<Response>();
  const fetchMock = vi.fn(() => pending.promise);
  vi.stubGlobal("fetch", fetchMock);
  const { controller, revision, state } = createHarness();
  const refresh = Effect.runPromise(controller.refreshOnResumeEffect());
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  const mutation = revision.beginMutation(period.id);
  controller.cancelHistoryLoad(period.id, "2026-07-13");
  revision.publish(createSummary(500, 1_000), (summary) => {
    state.summary = summary;
  });
  revision.completeMutation(period.id, mutation);
  const current = history("current day");
  pending.resolve(jsonResponse({ histories: [current] }));
  await settled(refresh);

  expect(controller.histories).toEqual([current]);
});
