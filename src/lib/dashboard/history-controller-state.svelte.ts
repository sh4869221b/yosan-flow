import { Effect } from "effect";
import { dayHistoryUrl } from "#lib/dashboard/api-urls.ts";
import { runClientEffect } from "#lib/dashboard/client-effect.ts";
import { fetchJsonEffect } from "#lib/dashboard/fetch-json.ts";
import { createHistoryMutationLifecycle } from "#lib/dashboard/history-mutation-lifecycle.ts";
import { createHistoryResumeEffect } from "#lib/dashboard/history-resume.ts";
import type {
  DeleteHistoryPayload,
  HistoryActionResult,
  HistoryItem,
  HistoryResponse,
  UpdateHistoryPayload,
} from "#lib/dashboard/types.ts";
import type {
  DailyRow,
  PeriodSummary,
} from "#lib/dashboard/controller-types.ts";
import { createPeriodSummaryRevision } from "#lib/dashboard/period-summary-revision.ts";
import { createRetainedHistoryStore } from "#lib/dashboard/retained-history-store.ts";
import { findSummaryRow } from "#lib/dashboard/summary-rows.ts";

type HistoryControllerDependencies = {
  readonly getSelectedDate: () => string | null;
  readonly getSelectedPeriodId: () => string | null;
  readonly getSummary?: () => PeriodSummary | null;
  readonly getModalOpen?: () => boolean;
  readonly setSelectedRow: (_row: DailyRow | null) => void;
  readonly setSummary: (_summary: PeriodSummary) => void;
};

export function createHistoryControllerState(
  dependencies: HistoryControllerDependencies,
  summaryRevision = createPeriodSummaryRevision(),
) {
  let historyLoading = $state(false);
  let historyError = $state<string | null>(null);
  let historyMutationVersion = $state(0);
  let histories = $state<HistoryItem[]>([]);
  let historyRequestSequence = 0;
  let historySessionGeneration = 0;
  let activeHistoryRequest: { periodId: string; date: string } | null = null;
  // Imperative request-order bookkeeping, never rendered or observed by a rune.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Reactive subscriptions would couple race guards to UI effects.
  const mutationSequences = new Map<string, number>();
  const retainedHistories = createRetainedHistoryStore();

  function ownsHistoryRequest(
    sequence: number,
    periodId: string,
    date: string,
    isCurrent?: () => boolean,
  ): boolean {
    return (
      sequence === historyRequestSequence &&
      dependencies.getSelectedPeriodId() === periodId &&
      dependencies.getSelectedDate() === date &&
      (isCurrent?.() ?? true)
    );
  }

  function loadHistoryResultEffect(
    date: string,
    options: {
      readonly background?: boolean;
      readonly isCurrent?: () => boolean;
    } = {},
  ): Effect.Effect<HistoryActionResult, never> {
    const selectedPeriodId = dependencies.getSelectedPeriodId();
    if (selectedPeriodId == null) {
      return Effect.succeed({ kind: "ignored" });
    }
    if (!options.background) {
      const retained = retainedHistories.replay(
        selectedPeriodId,
        date,
        summaryRevision.get(selectedPeriodId),
        summaryRevision.getMutationSequence(selectedPeriodId),
        dependencies.getSummary?.() ?? null,
      );
      if (retained.histories != null) {
        histories = [...retained.histories];
      } else if (retained.invalidated) {
        histories = [];
      }
    }
    historyRequestSequence += 1;
    const requestSequence = historyRequestSequence;
    activeHistoryRequest = { periodId: selectedPeriodId, date };
    return Effect.gen(function* () {
      if (!options.background) {
        historyLoading = true;
        historyError = null;
      }
      const result = yield* fetchJsonEffect<HistoryResponse>(
        dayHistoryUrl(selectedPeriodId, date),
        undefined,
        "履歴の取得に失敗しました。",
      ).pipe(Effect.result);
      const requestIsCurrent = ownsHistoryRequest(
        requestSequence,
        selectedPeriodId,
        date,
        options.isCurrent,
      );
      if (result._tag === "Failure" && requestIsCurrent) {
        historyError = result.failure;
      } else if (result._tag === "Success" && requestIsCurrent) {
        histories = result.success.histories ?? [];
        historyError = null;
        retainedHistories.clear(selectedPeriodId, date);
      }
      if (requestSequence === historyRequestSequence) {
        historyLoading = false;
        activeHistoryRequest = null;
      }
      if (!requestIsCurrent) return { kind: "ignored" } as const;
      return result._tag === "Success"
        ? ({ kind: "success" } as const)
        : ({ kind: "failure", message: result.failure } as const);
    });
  }

  function applyHistoryMutationSummary(summary: PeriodSummary): void {
    summaryRevision.publish(summary, dependencies.setSummary);
    const selectedDate = dependencies.getSelectedDate();
    if (selectedDate != null) {
      dependencies.setSelectedRow(findSummaryRow(summary, selectedDate));
    }
  }

  function cancelHistoryLoad(periodId: string, date: string): void {
    if (
      activeHistoryRequest?.periodId === periodId &&
      activeHistoryRequest.date === date
    ) {
      historyRequestSequence += 1;
      activeHistoryRequest = null;
      historyLoading = false;
    }
  }

  function invalidateHistoryLoads(periodId: string, date: string): void {
    mutationSequences.set(periodId, (mutationSequences.get(periodId) ?? 0) + 1);
    cancelHistoryLoad(periodId, date);
  }

  const historyMutations = createHistoryMutationLifecycle({
    applyHistories: (body) => {
      histories = body.histories;
      historyError = null;
    },
    applySummary: applyHistoryMutationSummary,
    bumpVersion: () => {
      historyMutationVersion += 1;
    },
    getSelectedDate: dependencies.getSelectedDate,
    getSelectedPeriodId: dependencies.getSelectedPeriodId,
    getSummary: () => dependencies.getSummary?.() ?? null,
    invalidateHistoryLoads,
    loadHistoryEffect: loadHistoryResultEffect,
    retainHistories: retainedHistories.retain,
    setError: (error) => (historyError = error),
    summaryRevision,
  });

  return {
    cancelHistoryLoad,
    refreshOnResumeEffect: createHistoryResumeEffect({
      ...dependencies,
      getModalOpen: dependencies.getModalOpen ?? (() => true),
      getSessionGeneration: () => historySessionGeneration,
      getRequestSequence: () => historyRequestSequence,
      loadHistoryEffect: (date, isCurrent) =>
        loadHistoryResultEffect(date, { background: true, isCurrent }).pipe(
          Effect.asVoid,
        ),
      summaryRevision,
    }),
    getMutationSequence(periodId: string): number {
      return mutationSequences.get(periodId) ?? 0;
    },
    get historyLoading() {
      return historyLoading;
    },
    get historyError() {
      return historyError;
    },
    get historyMutatingId() {
      return historyMutations.getVisibleId(historyMutationVersion);
    },
    get histories() {
      return histories;
    },
    resetHistories(): void {
      historySessionGeneration += 1;
      histories = [];
      historyError = null;
    },
    loadHistory(date: string): void {
      runClientEffect(loadHistoryResultEffect(date).pipe(Effect.asVoid));
    },
    loadHistoryEffect(date: string): Effect.Effect<void, never> {
      return loadHistoryResultEffect(date).pipe(Effect.asVoid);
    },
    retryHistory(date: string): Promise<HistoryActionResult> {
      return Effect.runPromise(loadHistoryResultEffect(date));
    },
    updateHistory(payload: UpdateHistoryPayload): Promise<HistoryActionResult> {
      return Effect.runPromise(
        historyMutations.mutateEffect(
          payload.historyId,
          {
            body: JSON.stringify({
              inputYen: payload.inputYen,
              memo: payload.memo,
            }),
            headers: { "content-type": "application/json" },
            method: "PATCH",
          },
          "履歴の更新に失敗しました。",
        ),
      );
    },
    deleteHistory(payload: DeleteHistoryPayload): Promise<HistoryActionResult> {
      return Effect.runPromise(
        historyMutations.mutateEffect(
          payload.historyId,
          { method: "DELETE" },
          "履歴の削除に失敗しました。",
        ),
      );
    },
  };
}
