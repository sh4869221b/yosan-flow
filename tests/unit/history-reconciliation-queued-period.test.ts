import { createPeriodUpdateConfirmationState } from "#lib/dashboard/period-update-confirmation-state.svelte.ts";
import { Effect } from "effect";
import { afterEach, expect, it, vi } from "vitest";
import { createHistoryMutationLifecycle } from "#lib/dashboard/history-mutation-lifecycle.ts";
import { createPeriodConfirmationEffects } from "#lib/dashboard/period-controller-confirm-effect.ts";
import { proposal } from "./period-controller-confirmation-fixture";
import { createPeriodSummaryRequestTracker } from "#lib/dashboard/period-summary-request-tracker.ts";
import { createPeriodSummaryRevision } from "#lib/dashboard/period-summary-revision.ts";
import { fetchJsonEffect } from "#lib/dashboard/fetch-json.ts";
import type { PeriodSummary } from "#lib/dashboard/controller-types.ts";
import type { HistoryItem, HistoryResponse } from "#lib/dashboard/types.ts";
import {
  createSummary,
  jsonResponse,
} from "./day-entry-controller-test-fixtures";
import { ControlledScheduler } from "./helpers/controlled-scheduler";

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
  const scheduler = new ControlledScheduler();
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
        Effect.as({ kind: "success" } as const),
        Effect.catch((message) =>
          Effect.succeed({ kind: "failure", message } as const),
        ),
      ),
    retainHistories: vi.fn(),
    setError: vi.fn(),
    summaryRevision: revision,
  });
  const confirmationState = createPeriodUpdateConfirmationState({
    getSelectedPeriodId: () => "period-1",
    summaryRevision: revision,
  });
  confirmationState.open({
    proposal,
    request: { ...proposal.target.after, confirmation: proposal },
    ownership: {
      targetId: "period-1",
      successorId: "period-2",
      requestSequence: 1,
      selectedPeriodId: "period-1",
      targetRevision: revision.get("period-1"),
      successorRevision: revision.get("period-2"),
    },
  });
  const pending = confirmationState.beginConfirmation();
  if (pending == null) throw new Error("Expected pending confirmation");
  const updatePeriod = createPeriodConfirmationEffects({
    confirmationState,
    resetRange: vi.fn(),
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
  Effect.runFork(updatePeriod.confirm(pending), { scheduler });
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
