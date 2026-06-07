import { Effect } from "effect";
import {
  dayHistoryUrl,
  fetchJsonEffect,
  historyItemUrl,
  runClientEffect,
} from "$lib/dashboard/api";
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
    return Effect.gen(function* () {
      historyLoading = true;
      historyError = null;
      const result = yield* fetchJsonEffect<HistoryResponse>(
        dayHistoryUrl(selectedPeriodId, date),
        undefined,
        "履歴の取得に失敗しました。",
      ).pipe(Effect.either);
      if (result._tag === "Left") {
        historyError = result.left;
      } else {
        histories = result.right.histories ?? [];
      }
      historyLoading = false;
    });
  }

  function applyHistoryMutationResult(
    body: HistoryMutationResponse<PeriodSummary>,
  ): void {
    dependencies.setSummary(body.summary);
    histories = body.histories;
    syncSelectedRow(body.summary);
  }

  function updateHistoryEffect(
    payload: UpdateHistoryPayload,
  ): Effect.Effect<void, never> {
    const selectedPeriodId = dependencies.getSelectedPeriodId();
    const selectedDate = dependencies.getSelectedDate();
    if (selectedPeriodId == null || selectedDate == null) {
      return Effect.void;
    }
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
      if (result._tag === "Left") {
        historyError = result.left;
      } else {
        applyHistoryMutationResult(result.right);
      }
      historyMutatingId = null;
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
      if (result._tag === "Left") {
        historyError = result.left;
      } else {
        applyHistoryMutationResult(result.right);
      }
      historyMutatingId = null;
    });
  }

  return {
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
