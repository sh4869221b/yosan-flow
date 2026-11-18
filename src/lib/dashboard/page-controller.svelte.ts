import { Effect } from "effect";
import { runClientEffect } from "#lib/dashboard/client-effect.ts";
import { createDayEntryControllerState } from "#lib/dashboard/day-entry-controller-state.svelte.ts";
import { createDayEntrySyncState } from "#lib/dashboard/day-entry-sync-state.svelte.ts";
import { createHistoryControllerState } from "#lib/dashboard/history-controller-state.svelte.ts";
import { createPeriodControllerState } from "#lib/dashboard/period-controller-state.svelte.ts";
import { createPeriodSummaryRevision } from "#lib/dashboard/period-summary-revision.ts";
import { findSummaryRow } from "#lib/dashboard/summary-rows.ts";
import type { DayEntryCloseReason } from "#lib/dashboard/controller-types.ts";
import type { PageData } from "../../routes/$types";

export function createDashboardPageController(getData: () => PageData) {
  const summarySync = createDayEntrySyncState(
    (): string | null => periodController.selectedPeriodId,
  );
  const summaryRevision = createPeriodSummaryRevision(
    summarySync.captureSummarySync,
  );
  let closeDayEntry = (_reason?: DayEntryCloseReason): void => undefined;
  let invalidateDaySelection = (): void => undefined;
  const periodController = createPeriodControllerState(
    getData(),
    summaryRevision,
    () => {
      invalidateDaySelection();
      closeDayEntry("period-change");
    },
  );

  const historyController = createHistoryControllerState(
    {
      getSelectedDate: () => dayEntryController.selectedDate,
      getSelectedPeriodId: () => periodController.selectedPeriodId,
      getSummary: () => periodController.summary,
      getModalOpen: () => dayEntryController.modalOpen,
      setSelectedRow: (row) => dayEntryController.setSelectedRow(row),
      setSummary: periodController.setSummary,
    },
    summaryRevision,
  );

  const dayEntryController = createDayEntryControllerState(
    {
      getSelectedPeriodId: () => periodController.selectedPeriodId,
      getSummary: () => periodController.summary,
      getDayEntryEpoch: () => getData().dayEntryEpoch,
      historyController,
      setSummary: periodController.setSummary,
    },
    summaryRevision,
    summarySync,
  );
  closeDayEntry = dayEntryController.closeDayEntry;
  invalidateDaySelection = dayEntryController.invalidateDaySelection;

  return {
    confirmation: periodController.confirmation,
    refreshPeriodConfirmation: periodController.refreshPeriodConfirmation,
    budget: periodController.budget,
    range: periodController.range,
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
    get confirmSaving() {
      return periodController.confirmSaving;
    },
    get periodUpdateProposal() {
      return periodController.periodUpdateProposal;
    },
    get periodInteractionDisabled() {
      return periodController.periodInteractionDisabled;
    },
    get createBudgetValue() {
      return periodController.createBudgetValue;
    },
    get createSaving() {
      return periodController.createSaving;
    },
    get createdRefreshing() {
      return periodController.createdRefreshing;
    },
    get createError() {
      return periodController.createError;
    },
    get createdPeriodId() {
      return periodController.createdPeriodId;
    },
    get createdRefreshPending() {
      return periodController.createdRefreshPending;
    },
    get createRangeInput() {
      return periodController.createRangeInput;
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
    get daySummarySyncPending() {
      return dayEntryController.summarySyncPending;
    },
    get daySummarySyncRefreshing() {
      return dayEntryController.summarySyncRefreshing;
    },
    retryDaySummarySync: dayEntryController.retrySummarySync,
    get daySaveSuccess() {
      return dayEntryController.daySaveSuccess;
    },
    get dayEntryCloseReason() {
      return dayEntryController.dayEntryCloseReason;
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
    get modalInputValue() {
      return dayEntryController.modalInputValue;
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
    saveBudget: periodController.saveBudget,
    saveRange: periodController.saveRange,
    refreshOnResume(complete: () => void): void {
      periodController.refreshOnResume(() => {
        const summary = periodController.summary;
        if (dayEntryController.modalOpen && summary != null) {
          dayEntryController.setSelectedRow(
            findSummaryRow(summary, dayEntryController.selectedDate),
          );
        }
        runClientEffect(
          historyController
            .refreshOnResumeEffect()
            .pipe(Effect.ensuring(Effect.sync(complete))),
        );
      });
    },
    handleSelectPeriod(payload: { periodId: string }): void {
      dayEntryController.invalidateDaySelection();
      periodController.handleSelectPeriod(payload);
    },
    navigateToPeriod(data: PageData): void {
      if (data.selectedPeriodId !== periodController.selectedPeriodId) {
        dayEntryController.invalidateDaySelection();
      }
      periodController.navigateToPeriod(data);
    },
    confirmPeriodUpdate: periodController.confirmPeriodUpdate,
    cancelPeriodUpdateConfirmation:
      periodController.cancelPeriodUpdateConfirmation,
    createInitialPeriod: periodController.createInitialPeriod,
    resetCreatePeriod: periodController.resetCreatePeriod,
    clearCreateError: periodController.clearCreateError,
    refreshCreatedPeriod: periodController.refreshCreatedPeriod,
    openDayEntry: dayEntryController.openDayEntry,
    closeDayEntry: dayEntryController.closeDayEntry,
    submitDayEntry: dayEntryController.submitDayEntry,
    retryHistory: historyController.retryHistory,
    updateHistory: historyController.updateHistory,
    deleteHistory: historyController.deleteHistory,
    updateCreatePeriodRange: periodController.updateCreatePeriodRange,
  };
}
