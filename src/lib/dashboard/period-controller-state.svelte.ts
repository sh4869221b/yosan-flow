import { createPeriodRefreshEffects } from "$lib/dashboard/period-controller-refresh-effect";
import { createPeriodConfirmationEffects } from "$lib/dashboard/period-controller-confirm-effect";
import type {
  PeriodOption,
  PeriodSummary,
} from "$lib/dashboard/controller-types";
import { createPeriodControllerActions } from "$lib/dashboard/period-controller-actions.svelte";
import { createPeriodCreateState } from "$lib/dashboard/period-create-state.svelte";
import { createPeriodUpdateEffect } from "$lib/dashboard/period-controller-update-effect";
import { getInitialPeriodControllerState } from "$lib/dashboard/period-controller-initial-state";
import { createPeriodUpdateConfirmationState } from "$lib/dashboard/period-update-confirmation-state.svelte";
import { createPeriodSummaryRequestTracker } from "$lib/dashboard/period-summary-request-tracker";
import { createPeriodSummaryRevision } from "$lib/dashboard/period-summary-revision";
import {
  createPeriodSettingsState,
  type PeriodSettingsSubmission,
} from "$lib/dashboard/period-settings-state.svelte";
import type { PageData } from "../../routes/$types";

export function createPeriodControllerState(
  data: PageData,
  summaryRevision = createPeriodSummaryRevision(),
  onPeriodChanged: () => void = () => undefined,
) {
  const initialState = getInitialPeriodControllerState(data);
  const summaryRequests = createPeriodSummaryRequestTracker(summaryRevision);

  let periods = $state<PeriodOption[]>(initialState.periods);
  let selectedPeriodId = $state<string | null>(initialState.selectedPeriodId);
  let summary = $state<PeriodSummary | null>(initialState.summary);
  let summaryLoading = $state(false);
  let summaryError = $state<string | null>(null);
  const createState = createPeriodCreateState({
    startDate: initialState.createStartDate,
  });
  const confirmationState = createPeriodUpdateConfirmationState({
    getSelectedPeriodId: () => selectedPeriodId,
    summaryRevision,
  });

  const interactionDisabled = () =>
    settings.budget.saving ||
    settings.range.saving ||
    createState.periodSaving ||
    confirmationState.confirmSaving ||
    confirmationState.refreshing ||
    confirmationState.pending != null;
  const settings = createPeriodSettingsState({
    getSummary: () => summary,
    getResetDisabled: interactionDisabled,
  });

  function publishSummary(
    nextSummary: PeriodSummary | null,
    submission?: PeriodSettingsSubmission,
  ): void {
    settings.adopt(nextSummary, submission);
    if (nextSummary != null) {
      const periodChanged = selectedPeriodId !== nextSummary.periodId;
      summaryRevision.advance(nextSummary.periodId);
      selectedPeriodId = nextSummary.periodId;
      if (periodChanged) onPeriodChanged();
    }
    summary = nextSummary;
    if (nextSummary == null) confirmationState.clear();
    else confirmationState.dropIfStale();
  }

  const { refreshSummaryEffect, refreshPeriodListEffect } =
    createPeriodRefreshEffects({
      summaryRequests,
      summaryRevision,
      publishSummary,
      getSelectedPeriodId: () => selectedPeriodId,
      setLoading: (value) => {
        summaryLoading = value;
      },
      setError: (value) => {
        summaryError = value;
      },
      setPeriods: (value) => {
        periods = value;
      },
      selectEmpty: () => {
        selectedPeriodId = null;
      },
    });

  const periodUpdateDependencies = {
    confirmationState,
    getSelectedPeriodId: () => selectedPeriodId,
    getSummary: () => summary,
    getSummaryLoading: () => summaryLoading,
    publishSummary,
    refreshPeriodListEffect,
    refreshSummaryEffect,
    setError: settings.setError,
    setSaving: settings.setSaving,
    summaryRequests,
    summaryRevision,
  };
  const savePeriodUpdate = createPeriodUpdateEffect(periodUpdateDependencies);
  const confirmationEffects = createPeriodConfirmationEffects({
    ...periodUpdateDependencies,
    resetRange: settings.range.reset,
  });

  const createDependencies = {
    ...periodUpdateDependencies,
    createState,
    getPeriods: () => periods,
    setPeriods: (nextPeriods: PeriodOption[]) => (periods = nextPeriods),
    setSummaryLoading: (loading: boolean) => (summaryLoading = loading),
  };

  return {
    budget: settings.budget,
    range: settings.range,
    get periods() {
      return periods;
    },
    get selectedPeriodId() {
      return selectedPeriodId;
    },
    get summary() {
      return summary;
    },
    get summaryLoading() {
      return summaryLoading;
    },
    get summaryError() {
      return summaryError;
    },
    get periodSaving() {
      return createState.periodSaving;
    },
    get confirmSaving() {
      return confirmationState.confirmSaving;
    },
    confirmation: confirmationState,
    get periodUpdateProposal() {
      return confirmationState.pending?.proposal ?? null;
    },
    get periodInteractionDisabled() {
      return interactionDisabled();
    },
    get periodError() {
      return createState.periodError;
    },
    get rangeStartDate() {
      return settings.range.draft.startDate;
    },
    get rangeEndDate() {
      return settings.range.draft.endDate;
    },
    get createStartDate() {
      return createState.createStartDate;
    },
    get createEndDate() {
      return createState.createEndDate;
    },
    get createPeriodId() {
      return createState.createPeriodId;
    },
    set createPeriodId(value: string) {
      createState.createPeriodId = value;
    },
    get createBudgetInput() {
      return createState.createBudgetInput;
    },
    set createBudgetInput(value: string) {
      createState.createBudgetInput = value;
    },
    get createSaving() {
      return createState.createSaving;
    },
    get createdRefreshing() {
      return createState.createdRefreshing;
    },
    get createError() {
      return createState.createError;
    },
    get createdPeriodId() {
      return createState.createdPeriodId;
    },
    get createdRefreshPending() {
      return createState.createdRefreshPending;
    },
    setSummary(nextSummary: PeriodSummary | null): void {
      settings.adopt(nextSummary);
      summary = nextSummary;
      if (nextSummary == null) confirmationState.clear();
      else confirmationState.dropIfStale();
    },
    ...createPeriodControllerActions({
      beginPeriodConfirmation: confirmationState.beginConfirmation,
      clearPeriodConfirmation: confirmationState.clear,
      confirmPeriodUpdateEffect: confirmationEffects.confirm,
      refreshConfirmationEffect: confirmationEffects.refresh,
      confirmationState,
      creation: createDependencies,
      getConfirmSaving: () => confirmationState.confirmSaving,
      settings,
      getInteractionDisabled: interactionDisabled,
      getSummaryLoading: () => summaryLoading,
      getSummary: () => summary,
      refreshSummaryEffect,
      savePeriodUpdateEffect: savePeriodUpdate,
      updateCreatePeriodRange: createState.updateRange,
    }),
  };
}
