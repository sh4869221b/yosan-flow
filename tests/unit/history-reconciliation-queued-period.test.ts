import { Effect, Scheduler } from "effect";
import { afterEach, expect, it, vi } from "vitest";
import { createHistoryMutationLifecycle } from "$lib/dashboard/history-mutation-lifecycle";
import { createPeriodUpdateEffect } from "$lib/dashboard/period-controller-update-effect";
import { createPeriodSummaryRequestTracker } from "$lib/dashboard/period-summary-request-tracker";
import { createPeriodSummaryRevision } from "$lib/dashboard/period-summary-revision";
import { fetchJsonEffect } from "$lib/dashboard/fetch-json";
import type { PeriodSummary } from "$lib/dashboard/controller-types";
import type { HistoryItem, HistoryResponse } from "$lib/dashboard/types";
import {
  createSummary,
  jsonResponse,
} from "./day-entry-controller-test-fixtures";

afterEach(() => vi.unstubAllGlobals());

function createHistory(id: string): HistoryItem {
  return {
    id,
    date: "2026-07-12",
    operationType: "add",
    inputYen: 500,
    beforeTotalYen: 0,
    afterTotalYen: 500,
    memo: id,
    createdAt: "2026-07-12T00:00:00.000Z",
  };
}

it("recovers histories after a pre-queued period mutation settles", async () => {
  const previousHistory = createHistory("PRE_MUTATION");
  const authoritativeHistory = createHistory("AUTHORITATIVE");
  const historyMutationResponse = Promise.withResolvers<Response>();
  const reconciliationSummaryResponse = Promise.withResolvers<Response>();
  const periodMutationResponse = Promise.withResolvers<Response>();
  const requests: string[] = [];
  let getCount = 0;
  const fetchMock = vi.fn(
    (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const method = init?.method ?? "GET";
      requests.push(method);
      if (method === "DELETE") return historyMutationResponse.promise;
      if (method === "PUT") return periodMutationResponse.promise;
      getCount += 1;
      if (getCount === 1) return reconciliationSummaryResponse.promise;
      return Promise.resolve(
        jsonResponse({ histories: [authoritativeHistory] }),
      );
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  const scheduler = new Scheduler.ControlledScheduler();
  const revision = createPeriodSummaryRevision();
  let summary: PeriodSummary = createSummary(0);
  let histories = [previousHistory];
  const historyLifecycle = createHistoryMutationLifecycle({
    applyHistories: (body) => {
      histories = body.histories;
    },
    applySummary: (nextSummary) => {
      summary = nextSummary;
    },
    bumpVersion: vi.fn(),
    getSelectedDate: () => "2026-07-12",
    getSelectedPeriodId: () => "period-1",
    getSummary: () => summary,
    invalidateHistoryLoads: vi.fn(),
    loadHistoryEffect: () =>
      fetchJsonEffect<HistoryResponse>(
        "/history",
        undefined,
        "履歴の取得に失敗しました。",
      ).pipe(
        Effect.tap((body) =>
          Effect.sync(() => {
            histories = [...(body.histories ?? [])];
          }),
        ),
        Effect.orElseSucceed(() => undefined),
      ),
    retainHistories: vi.fn(),
    setError: vi.fn(),
    summaryRevision: revision,
  });
  const updatePeriod = createPeriodUpdateEffect({
    getSelectedPeriodId: () => "period-1",
    getSummary: () => summary,
    getSummaryLoading: () => false,
    publishSummary: (nextSummary) => {
      summary = nextSummary;
    },
    refreshPeriodListEffect: () => Effect.void,
    refreshSummaryEffect: () => Effect.void,
    setError: vi.fn(),
    setSaving: vi.fn(),
    summaryRequests: createPeriodSummaryRequestTracker(revision),
    summaryRevision: revision,
  });

  Effect.runFork(
    historyLifecycle.mutateEffect(
      "history-1",
      { method: "DELETE" },
      "履歴の削除に失敗しました。",
    ),
    { scheduler },
  );
  scheduler.step();
  expect(requests).toEqual(["DELETE"]);
  Effect.runFork(
    updatePeriod({
      budgetYen: 12_000,
      startDate: "2026-07-12",
      endDate: "2026-08-10",
    }),
    { scheduler },
  );
  scheduler.step();
  expect(requests).toEqual(["DELETE"]);

  historyMutationResponse.resolve(
    new Response("{", {
      headers: { "content-type": "application/json" },
      status: 200,
    }),
  );
  for (let index = 0; index < 12 && requests.length < 3; index += 1) {
    await Promise.resolve();
    scheduler.step();
  }
  expect(requests).toEqual(["DELETE", "GET", "PUT"]);
  expect(revision.isMutationActive("period-1")).toBe(true);
  expect(histories).toEqual([previousHistory]);

  reconciliationSummaryResponse.resolve(jsonResponse(createSummary(500)));
  for (let index = 0; index < 6; index += 1) {
    await Promise.resolve();
    scheduler.step();
  }
  expect(histories).toEqual([previousHistory]);

  const repairedSummary = createSummary(700);
  periodMutationResponse.resolve(jsonResponse(repairedSummary));
  for (
    let index = 0;
    index < 24 && histories[0]?.id !== authoritativeHistory.id;
    index += 1
  ) {
    await Promise.resolve();
    scheduler.step();
  }

  expect(summary).toEqual(repairedSummary);
  expect(histories).toEqual([authoritativeHistory]);
  expect(requests).toEqual(["DELETE", "GET", "PUT", "GET"]);
});
