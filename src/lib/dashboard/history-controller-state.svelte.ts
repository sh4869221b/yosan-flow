import { Effect } from "effect";
import { dayHistoryUrl } from "$lib/dashboard/api-urls";
import { runClientEffect } from "$lib/dashboard/client-effect";
import { fetchJsonEffect } from "$lib/dashboard/fetch-json";
import { createHistoryMutationLifecycle } from "$lib/dashboard/history-mutation-lifecycle";
import type {
  DeleteHistoryPayload,
  HistoryActionResult,
  HistoryItem,
  HistoryMutationResponse,
  HistoryResponse,
  UpdateHistoryPayload,
} from "$lib/dashboard/types";
import type { DailyRow, PeriodSummary } from "$lib/dashboard/controller-types";
import { createPeriodSummaryRevision } from "$lib/dashboard/period-summary-revision";
import { createRetainedHistoryStore } from "$lib/dashboard/retained-history-store";

type HistoryControllerDependencies = {
  readonly getSelectedDate: () => string | null;
  readonly getSelectedPeriodId: () => string | null;
  readonly getSummary?: () => PeriodSummary | null;
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
  let activeHistoryRequest: { periodId: string; date: string } | null = null;
  const mutationSequences = new Map<string, number>();
  const retainedHistories = createRetainedHistoryStore();

  function syncSelectedRow(summary: PeriodSummary): void {
    const selectedDate = dependencies.getSelectedDate();
    if (selectedDate == null) {
      return;
    }
    dependencies.setSelectedRow(
      summary.dailyRows.find((row) => row.date === selectedDate) ?? null,
    );
  }

  function loadHistoryResultEffect(
    date: string,
  ): Effect.Effect<HistoryActionResult, never> {
    const selectedPeriodId = dependencies.getSelectedPeriodId();
    if (selectedPeriodId == null) {
      return Effect.succeed({ kind: "ignored" });
    }
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
    historyRequestSequence += 1;
    const requestSequence = historyRequestSequence;
    activeHistoryRequest = { periodId: selectedPeriodId, date };
    return Effect.gen(function* () {
      historyLoading = true;
      historyError = null;
      const result = yield* fetchJsonEffect<HistoryResponse>(
        dayHistoryUrl(selectedPeriodId, date),
        undefined,
        "履歴の取得に失敗しました。",
      ).pipe(Effect.either);
      const requestIsCurrent =
        requestSequence === historyRequestSequence &&
        dependencies.getSelectedPeriodId() === selectedPeriodId &&
        dependencies.getSelectedDate() === date;
      if (result._tag === "Left" && requestIsCurrent) {
        historyError = result.left;
      } else if (result._tag === "Right" && requestIsCurrent) {
        histories = result.right.histories ?? [];
        retainedHistories.clear(selectedPeriodId, date);
      }
      if (requestSequence === historyRequestSequence) {
        historyLoading = false;
        activeHistoryRequest = null;
      }
      if (!requestIsCurrent) return { kind: "ignored" } as const;
      return result._tag === "Right"
        ? ({ kind: "success" } as const)
        : ({ kind: "failure", message: result.left } as const);
    });
  }

  function applyHistoryMutationSummary(summary: PeriodSummary): void {
    summaryRevision.publish(summary, dependencies.setSummary);
    syncSelectedRow(summary);
  }

  function applyHistoryMutationHistories(
    body: HistoryMutationResponse<PeriodSummary>,
  ): void {
    histories = body.histories;
    historyError = null;
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
    applyHistories: applyHistoryMutationHistories,
    applySummary: applyHistoryMutationSummary,
    bumpVersion: () => {
      historyMutationVersion += 1;
    },
    getSelectedDate: dependencies.getSelectedDate,
    getSelectedPeriodId: dependencies.getSelectedPeriodId,
    getSummary: () => dependencies.getSummary?.() ?? null,
    invalidateHistoryLoads,
    loadHistoryEffect: loadHistoryResultEffect,
    retainHistories: (periodId, date, body, revision, mutationSequence) => {
      retainedHistories.retain(
        periodId,
        date,
        body,
        revision,
        mutationSequence,
      );
    },
    setError: (error) => (historyError = error),
    summaryRevision,
  });

  function updateHistoryEffect(
    payload: UpdateHistoryPayload,
  ): Effect.Effect<HistoryActionResult, never> {
    return historyMutations.mutateEffect(
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
    );
  }

  function deleteHistoryEffect(
    payload: DeleteHistoryPayload,
  ): Effect.Effect<HistoryActionResult, never> {
    return historyMutations.mutateEffect(
      payload.historyId,
      { method: "DELETE" },
      "履歴の削除に失敗しました。",
    );
  }

  return {
    cancelHistoryLoad,
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
      return Effect.runPromise(updateHistoryEffect(payload));
    },
    deleteHistory(payload: DeleteHistoryPayload): Promise<HistoryActionResult> {
      return Effect.runPromise(deleteHistoryEffect(payload));
    },
  };
}
