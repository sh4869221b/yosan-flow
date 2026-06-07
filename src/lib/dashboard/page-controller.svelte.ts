import { createDayEntryControllerState } from "$lib/dashboard/day-entry-controller-state.svelte";
import { createHistoryControllerState } from "$lib/dashboard/history-controller-state.svelte";
import { createPeriodControllerState } from "$lib/dashboard/period-controller-state.svelte";
import type { DailyRow } from "$lib/dashboard/controller-types";
import type { PageData } from "../../routes/$types";

export function createDashboardPageController(getData: () => PageData) {
  const periodController = createPeriodControllerState(getData());

  const historyController = createHistoryControllerState({
    getSelectedDate,
    getSelectedPeriodId: () => periodController.selectedPeriodId,
    setSelectedRow,
    setSummary: (nextSummary) => periodController.setSummary(nextSummary),
  });

  const dayEntryController = createDayEntryControllerState({
    getSelectedPeriodId: () => periodController.selectedPeriodId,
    getSummary: () => periodController.summary,
    historyController,
    setSummary: (nextSummary) => periodController.setSummary(nextSummary),
  });

  function getSelectedDate(): string | null {
    return dayEntryController.selectedDate;
  }

  function setSelectedRow(row: DailyRow | null): void {
    dayEntryController.setSelectedRow(row);
  }

  return {
    get periods() {
      return periodController.periods;
    },
    get selectedPeriodId() {
      return periodController.selectedPeriodId;
    },
    get summary() {
      return periodController.summary;
    },
    get summaryLoading() {
      return periodController.summaryLoading;
    },
    get summaryError() {
      return periodController.summaryError;
    },
    get periodSaving() {
      return periodController.periodSaving;
    },
    get periodError() {
      return periodController.periodError;
    },
    get rangeStartDate() {
      return periodController.rangeStartDate;
    },
    get rangeEndDate() {
      return periodController.rangeEndDate;
    },
    get createStartDate() {
      return periodController.createStartDate;
    },
    get createEndDate() {
      return periodController.createEndDate;
    },
    get createPeriodId() {
      return periodController.createPeriodId;
    },
    set createPeriodId(value: string) {
      periodController.createPeriodId = value;
    },
    get createBudgetInput() {
      return periodController.createBudgetInput;
    },
    set createBudgetInput(value: string) {
      periodController.createBudgetInput = value;
    },
    get modalOpen() {
      return dayEntryController.modalOpen;
    },
    get modalSaving() {
      return dayEntryController.modalSaving;
    },
    get modalError() {
      return dayEntryController.modalError;
    },
    get selectedDate() {
      return dayEntryController.selectedDate;
    },
    get selectedRow() {
      return dayEntryController.selectedRow;
    },
    get historyLoading() {
      return historyController.historyLoading;
    },
    get historyError() {
      return historyController.historyError;
    },
    get historyMutatingId() {
      return historyController.historyMutatingId;
    },
    get histories() {
      return historyController.histories;
    },
    get modalInputYen() {
      return dayEntryController.modalInputYen;
    },
    set modalInputYen(value: string) {
      dayEntryController.modalInputYen = value;
    },
    get modalMemo() {
      return dayEntryController.modalMemo;
    },
    set modalMemo(value: string) {
      dayEntryController.modalMemo = value;
    },
    get modalPreviewAfterYen() {
      return dayEntryController.modalPreviewAfterYen;
    },
    get modalPreviewRemainingYen() {
      return dayEntryController.modalPreviewRemainingYen;
    },
    get modalPreviewRecommendedYen() {
      return dayEntryController.modalPreviewRecommendedYen;
    },
    handleSavePeriod: periodController.handleSavePeriod,
    handleRangeChange: periodController.handleRangeChange,
    handleSelectPeriod: periodController.handleSelectPeriod,
    createInitialPeriod: periodController.createInitialPeriod,
    openDayEntry: dayEntryController.openDayEntry,
    closeDayEntry: dayEntryController.closeDayEntry,
    submitDayEntry: dayEntryController.submitDayEntry,
    updateHistory: historyController.updateHistory,
    deleteHistory: historyController.deleteHistory,
    updateCreatePeriodRange: periodController.updateCreatePeriodRange,
  };
}
