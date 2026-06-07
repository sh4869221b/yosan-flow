import { Effect } from "effect";
import {
  dayAddUrl,
  fetchJsonEffect,
  runClientEffect,
} from "$lib/dashboard/api";
import {
  getModalPreviewAfterYen,
  getModalPreviewRecommendedYen,
  getModalPreviewRemainingYen,
  getModalRemainingRows,
} from "$lib/dashboard/modal-preview";
import type { SubmitDayEntryPayload } from "$lib/dashboard/types";
import type { DailyRow, PeriodSummary } from "$lib/dashboard/controller-types";

type HistoryController = {
  readonly loadHistory: (_date: string) => void;
  readonly loadHistoryEffect: (_date: string) => Effect.Effect<void, never>;
  readonly resetHistories: () => void;
};

type DayEntryControllerDependencies = {
  readonly getSelectedPeriodId: () => string | null;
  readonly getSummary: () => PeriodSummary | null;
  readonly historyController: HistoryController;
  readonly setSummary: (_summary: PeriodSummary) => void;
};

export function createDayEntryControllerState(
  dependencies: DayEntryControllerDependencies,
) {
  let modalOpen = $state(false);
  let modalSaving = $state(false);
  let modalError = $state<string | null>(null);
  let selectedDate = $state<string | null>(null);
  let selectedRow = $state<DailyRow | null>(null);
  let modalInputYen = $state("");
  let modalMemo = $state("");

  const modalPreviewAfterYen = $derived(
    getModalPreviewAfterYen(selectedRow, modalInputYen),
  );
  const modalRemainingRows = $derived(
    getModalRemainingRows(dependencies.getSummary(), selectedDate),
  );
  const modalPreviewRemainingYen = $derived(
    getModalPreviewRemainingYen(
      dependencies.getSummary(),
      selectedRow,
      modalPreviewAfterYen,
    ),
  );
  const modalPreviewRecommendedYen = $derived(
    getModalPreviewRecommendedYen(modalPreviewRemainingYen, modalRemainingRows),
  );

  function closeDayEntry(): void {
    modalOpen = false;
    modalError = null;
  }

  function submitDayEntryEffect(
    payload: SubmitDayEntryPayload,
  ): Effect.Effect<void, never> {
    const selectedPeriodId = dependencies.getSelectedPeriodId();
    if (selectedPeriodId == null) {
      return Effect.void;
    }
    return Effect.gen(function* () {
      modalSaving = true;
      modalError = null;
      const result = yield* fetchJsonEffect<PeriodSummary>(
        dayAddUrl(selectedPeriodId, payload.date),
        {
          body: JSON.stringify({
            inputYen: payload.inputYen,
            memo: payload.memo,
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        },
        "保存に失敗しました。",
      ).pipe(Effect.either);
      if (result._tag === "Left") {
        modalError = result.left;
      } else {
        dependencies.setSummary(result.right);
        if (selectedDate != null) {
          selectedRow =
            result.right.dailyRows.find((row) => row.date === selectedDate) ??
            null;
          yield* dependencies.historyController.loadHistoryEffect(selectedDate);
        }
        closeDayEntry();
      }
      modalSaving = false;
    });
  }

  return {
    get modalOpen() {
      return modalOpen;
    },
    get modalSaving() {
      return modalSaving;
    },
    get modalError() {
      return modalError;
    },
    get selectedDate() {
      return selectedDate;
    },
    get selectedRow() {
      return selectedRow;
    },
    setSelectedRow(row: DailyRow | null): void {
      selectedRow = row;
    },
    get modalInputYen() {
      return modalInputYen;
    },
    set modalInputYen(value: string) {
      modalInputYen = value;
    },
    get modalMemo() {
      return modalMemo;
    },
    set modalMemo(value: string) {
      modalMemo = value;
    },
    get modalPreviewAfterYen() {
      return modalPreviewAfterYen;
    },
    get modalPreviewRemainingYen() {
      return modalPreviewRemainingYen;
    },
    get modalPreviewRecommendedYen() {
      return modalPreviewRecommendedYen;
    },
    openDayEntry(payload: { date: string }): void {
      const summary = dependencies.getSummary();
      if (summary == null) {
        return;
      }
      selectedDate = payload.date;
      selectedRow =
        summary.dailyRows.find((row) => row.date === selectedDate) ?? null;
      modalError = null;
      modalOpen = true;
      modalInputYen = "";
      modalMemo = "";
      dependencies.historyController.resetHistories();
      dependencies.historyController.loadHistory(payload.date);
    },
    closeDayEntry,
    submitDayEntry(payload: SubmitDayEntryPayload): void {
      runClientEffect(submitDayEntryEffect(payload));
    },
  };
}
