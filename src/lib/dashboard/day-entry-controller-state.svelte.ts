import { Effect } from "effect";
import { runClientEffect } from "$lib/dashboard/client-effect";
import { createDayEntryMutationLifecycle } from "$lib/dashboard/day-entry-mutation-lifecycle";
import { findSummaryRow } from "$lib/dashboard/summary-rows";
import { createPeriodSummaryRevision } from "$lib/dashboard/period-summary-revision";
import {
  getModalPreviewAfterYen,
  getModalPreviewRecommendedYen,
  getModalPreviewRemainingYen,
  getModalRemainingRows,
} from "$lib/dashboard/modal-preview";
import type { SubmitDayEntryPayload } from "$lib/dashboard/types";
import type { DailyRow, PeriodSummary } from "$lib/dashboard/controller-types";

type HistoryController = {
  readonly cancelHistoryLoad?: (_periodId: string, _date: string) => void;
  readonly getMutationSequence: (_periodId: string) => number;
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
  summaryRevision = createPeriodSummaryRevision(),
) {
  let modalOpen = $state(false);
  let modalSaving = $state(false);
  let modalError = $state<string | null>(null);
  let selectedDate = $state<string | null>(null);
  let selectedRow = $state<DailyRow | null>(null);
  let modalInputYen = $state("");
  let modalMemo = $state("");
  const mutationLifecycle = createDayEntryMutationLifecycle({
    cancelHistoryLoad: dependencies.historyController.cancelHistoryLoad,
    closeModal: closeDayEntry,
    getHistoryMutationSequence:
      dependencies.historyController.getMutationSequence,
    getSelectedDate: () => selectedDate,
    getSelectedPeriodId: dependencies.getSelectedPeriodId,
    getSummary: dependencies.getSummary,
    loadHistoryEffect: dependencies.historyController.loadHistoryEffect,
    setError: (error) => {
      modalError = error;
    },
    setSaving: (saving) => {
      modalSaving = saving;
    },
    setSelectedRow: (row) => {
      selectedRow = row;
    },
    setSummary: dependencies.setSummary,
    summaryRevision,
  });

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
      mutationLifecycle.beginModalSession();
      selectedDate = payload.date;
      selectedRow = findSummaryRow(summary, selectedDate);
      modalError = null;
      modalOpen = true;
      modalInputYen = "";
      modalMemo = "";
      dependencies.historyController.resetHistories();
      dependencies.historyController.loadHistory(payload.date);
    },
    closeDayEntry,
    submitDayEntry(payload: SubmitDayEntryPayload): void {
      runClientEffect(mutationLifecycle.submitEffect(payload));
    },
  };
}
