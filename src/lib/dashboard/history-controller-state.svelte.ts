import { Effect } from "effect";
import { dayHistoryUrl, historyItemUrl } from "$lib/dashboard/api-urls";
import { runClientEffect } from "$lib/dashboard/client-effect";
import { fetchJsonEffect } from "$lib/dashboard/fetch-json";
import type {
  DeleteHistoryPayload,
  HistoryItem,
  HistoryMutationResponse,
  HistoryResponse,
  UpdateHistoryPayload,
} from "$lib/dashboard/types";
import type { DailyRow, PeriodSummary } from "$lib/dashboard/controller-types";

type HistoryControllerDependencies = {
  readonly getSelectedDate: () => string | null;
  readonly getSelectedPeriodId: () => string | null;
  readonly setSelectedRow: (_row: DailyRow | null) => void;
  readonly setSummary: (_summary: PeriodSummary) => void;
};

export function createHistoryControllerState(
  dependencies: HistoryControllerDependencies,
) {
  let historyLoading = $state(false);
  let historyError = $state<string | null>(null);
  let historyMutatingId = $state<string | null>(null);
  let histories = $state<HistoryItem[]>([]);
  let historyRequestSequence = 0;
  let activeHistoryRequest: { periodId: string; date: string } | null = null;
  let historyMutationSequence = 0;
  const mutationSequences = new Map<string, number>();

  function syncSelectedRow(summary: PeriodSummary): void {
    const selectedDate = dependencies.getSelectedDate();
    if (selectedDate == null) {
      return;
    }
    dependencies.setSelectedRow(
      summary.dailyRows.find((row) => row.date === selectedDate) ?? null,
    );
  }

  function loadHistoryEffect(date: string): Effect.Effect<void, never> {
    const selectedPeriodId = dependencies.getSelectedPeriodId();
    if (selectedPeriodId == null) {
      return Effect.void;
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
      }
      if (requestSequence === historyRequestSequence) {
        historyLoading = false;
        activeHistoryRequest = null;
      }
    });
  }

  function applyHistoryMutationSummary(summary: PeriodSummary): void {
    dependencies.setSummary(summary);
    syncSelectedRow(summary);
  }

  function applyHistoryMutationHistories(
    body: HistoryMutationResponse<PeriodSummary>,
  ): void {
    histories = body.histories;
    historyError = null;
  }

  function invalidateHistoryLoads(periodId: string, date: string): void {
    mutationSequences.set(periodId, (mutationSequences.get(periodId) ?? 0) + 1);
    if (
      activeHistoryRequest?.periodId === periodId &&
      activeHistoryRequest.date === date
    ) {
      historyRequestSequence += 1;
      activeHistoryRequest = null;
      historyLoading = false;
    }
  }

  function updateHistoryEffect(
    payload: UpdateHistoryPayload,
  ): Effect.Effect<void, never> {
    const selectedPeriodId = dependencies.getSelectedPeriodId();
    const selectedDate = dependencies.getSelectedDate();
    if (selectedPeriodId == null || selectedDate == null) {
      return Effect.void;
    }
    historyMutationSequence += 1;
    const mutationSequence = historyMutationSequence;
    return Effect.gen(function* () {
      historyMutatingId = payload.historyId;
      historyError = null;
      const result = yield* fetchJsonEffect<
        HistoryMutationResponse<PeriodSummary>
      >(
        historyItemUrl(selectedPeriodId, selectedDate, payload.historyId),
        {
          body: JSON.stringify({
            inputYen: payload.inputYen,
            memo: payload.memo,
          }),
          headers: { "content-type": "application/json" },
          method: "PATCH",
        },
        "履歴の更新に失敗しました。",
      ).pipe(Effect.either);
      invalidateHistoryLoads(selectedPeriodId, selectedDate);
      const mutationOwnsCurrentPeriod =
        mutationSequence === historyMutationSequence &&
        dependencies.getSelectedPeriodId() === selectedPeriodId;
      const mutationOwnsCurrentDate =
        mutationOwnsCurrentPeriod &&
        dependencies.getSelectedDate() === selectedDate;
      if (result._tag === "Left" && mutationOwnsCurrentDate) {
        historyError = result.left;
      } else if (
        result._tag === "Right" &&
        mutationOwnsCurrentPeriod &&
        result.right.summary.periodId === selectedPeriodId
      ) {
        applyHistoryMutationSummary(result.right.summary);
        if (mutationOwnsCurrentDate) {
          applyHistoryMutationHistories(result.right);
        }
      }
      if (mutationSequence === historyMutationSequence) {
        historyMutatingId = null;
      }
    });
  }

  function deleteHistoryEffect(
    payload: DeleteHistoryPayload,
  ): Effect.Effect<void, never> {
    const selectedPeriodId = dependencies.getSelectedPeriodId();
    const selectedDate = dependencies.getSelectedDate();
    if (selectedPeriodId == null || selectedDate == null) {
      return Effect.void;
    }
    historyMutationSequence += 1;
    const mutationSequence = historyMutationSequence;
    return Effect.gen(function* () {
      historyMutatingId = payload.historyId;
      historyError = null;
      const result = yield* fetchJsonEffect<
        HistoryMutationResponse<PeriodSummary>
      >(
        historyItemUrl(selectedPeriodId, selectedDate, payload.historyId),
        { method: "DELETE" },
        "履歴の削除に失敗しました。",
      ).pipe(Effect.either);
      invalidateHistoryLoads(selectedPeriodId, selectedDate);
      const mutationOwnsCurrentPeriod =
        mutationSequence === historyMutationSequence &&
        dependencies.getSelectedPeriodId() === selectedPeriodId;
      const mutationOwnsCurrentDate =
        mutationOwnsCurrentPeriod &&
        dependencies.getSelectedDate() === selectedDate;
      if (result._tag === "Left" && mutationOwnsCurrentDate) {
        historyError = result.left;
      } else if (
        result._tag === "Right" &&
        mutationOwnsCurrentPeriod &&
        result.right.summary.periodId === selectedPeriodId
      ) {
        applyHistoryMutationSummary(result.right.summary);
        if (mutationOwnsCurrentDate) {
          applyHistoryMutationHistories(result.right);
        }
      }
      if (mutationSequence === historyMutationSequence) {
        historyMutatingId = null;
      }
    });
  }

  return {
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
      return historyMutatingId;
    },
    get histories() {
      return histories;
    },
    resetHistories(): void {
      histories = [];
      historyError = null;
    },
    loadHistory(date: string): void {
      runClientEffect(loadHistoryEffect(date));
    },
    loadHistoryEffect,
    updateHistory(payload: UpdateHistoryPayload): void {
      runClientEffect(updateHistoryEffect(payload));
    },
    deleteHistory(payload: DeleteHistoryPayload): void {
      runClientEffect(deleteHistoryEffect(payload));
    },
  };
}
