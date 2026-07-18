import { Effect } from "effect";
import { periodSummaryUrl, periodsUrl } from "$lib/dashboard/api-urls";
import { fetchJsonEffect } from "$lib/dashboard/fetch-json";
import type {
  PeriodOption,
  PeriodSummary,
} from "$lib/dashboard/controller-types";
import { addDays, toPeriodId } from "$lib/dashboard/date";
import { createPeriodControllerActions } from "$lib/dashboard/period-controller-actions.svelte";
import { createInitialPeriodEffect as createPeriodCreationEffect } from "$lib/dashboard/period-controller-create-effect";
import {
  createPeriodConfirmEffect,
  createPeriodUpdateEffect,
} from "$lib/dashboard/period-controller-update-effect";
import { getInitialPeriodControllerState } from "$lib/dashboard/period-controller-initial-state";
import { createPeriodUpdateConfirmationState } from "$lib/dashboard/period-update-confirmation-state.svelte";
import { createPeriodSummaryRequestTracker } from "$lib/dashboard/period-summary-request-tracker";
import { createPeriodSummaryRevision } from "$lib/dashboard/period-summary-revision";
import type { PeriodListResponse } from "$lib/dashboard/types";
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
  let periodSaving = $state(false);
  let periodError = $state<string | null>(null);
  let rangeStartDate = $state(
    initialState.summary?.startDate ?? initialState.today,
  );
  let rangeEndDate = $state(
    initialState.summary?.endDate ?? addDays(initialState.today, 29),
  );
  let createStartDate = $state(initialState.createStartDate);
  let createEndDate = $state(addDays(initialState.createStartDate, 29));
  let createPeriodId = $state(toPeriodId(initialState.createStartDate));
  let createBudgetInput = $state("120000");
  const confirmationState = createPeriodUpdateConfirmationState({
    getSelectedPeriodId: () => selectedPeriodId,
    summaryRevision,
  });

  function publishSummary(nextSummary: PeriodSummary | null): void {
    if (nextSummary != null) {
      const periodChanged = selectedPeriodId !== nextSummary.periodId;
      summaryRevision.advance(nextSummary.periodId);
      selectedPeriodId = nextSummary.periodId;
      if (periodChanged) onPeriodChanged();
      rangeStartDate = nextSummary.startDate;
      rangeEndDate = nextSummary.endDate;
    }
    summary = nextSummary;
    confirmationState.dropIfStale();
  }

  function refreshSummaryEffect(
    periodId: string,
    reportError = true,
  ): Effect.Effect<void, never> {
    const request = summaryRequests.start(periodId);
    return Effect.gen(function* () {
      summaryLoading = true;
      summaryError = null;
      if (request.mutationWasActive) {
        yield* summaryRevision.awaitMutationSettlement(
          periodId,
          request.mutationSequence,
        );
        if (summaryRequests.owns(request)) {
          yield* refreshSummaryEffect(periodId, reportError);
        }
        return;
      }
      const result = yield* fetchJsonEffect<PeriodSummary>(
        periodSummaryUrl(periodId),
        undefined,
        "再取得に失敗しました。",
      ).pipe(Effect.either);
      if (summaryRequests.isFresh(request)) {
        if (result._tag === "Left") {
          if (reportError) summaryError = result.left;
        } else if (result.right.periodId === periodId) {
          publishSummary(result.right);
        }
      }
      if (summaryRequests.owns(request)) {
        summaryLoading = false;
      }
    });
  }

  function refreshPeriodListEffect(
    preferredPeriodId?: string,
    reportSummaryError = true,
  ): Effect.Effect<void, string> {
    const request = summaryRequests.start(
      preferredPeriodId ?? selectedPeriodId,
    );
    summaryLoading = false;
    return Effect.gen(function* () {
      const body = yield* fetchJsonEffect<PeriodListResponse<PeriodOption>>(
        periodsUrl(),
        undefined,
        "保存に失敗しました。",
      );
      if (!summaryRequests.owns(request)) {
        return;
      }
      periods = body.periods ?? [];
      if (periods.length === 0) {
        selectedPeriodId = null;
        publishSummary(null);
        return;
      }
      const matched =
        periods.find((period) => period.id === preferredPeriodId) ??
        periods.find((period) => period.id === selectedPeriodId) ??
        periods[periods.length - 1];
      yield* refreshSummaryEffect(matched.id, reportSummaryError);
    });
  }

  const periodUpdateDependencies = {
    confirmationState,
    getSelectedPeriodId: () => selectedPeriodId,
    getSummary: () => summary,
    getSummaryLoading: () => summaryLoading,
    publishSummary,
    refreshPeriodListEffect,
    refreshSummaryEffect,
    setError: (error: string | null) => (periodError = error),
    setSaving: (saving: boolean) => (periodSaving = saving),
    summaryRequests,
    summaryRevision,
  };
  const savePeriodUpdateEffect = createPeriodUpdateEffect(
    periodUpdateDependencies,
  );
  const confirmPeriodUpdateEffect = createPeriodConfirmEffect(
    periodUpdateDependencies,
  );

  function createInitialPeriodEffect(): Effect.Effect<void, never> {
    return createPeriodCreationEffect({
      getBudgetInput: () => createBudgetInput,
      getEndDate: () => createEndDate,
      getPeriodId: () => createPeriodId,
      getPeriods: () => periods,
      getStartDate: () => createStartDate,
      refreshPeriodListEffect,
      setError: (error) => {
        periodError = error;
      },
      setSaving: (saving) => {
        periodSaving = saving;
      },
    });
  }

  const actions = createPeriodControllerActions({
    beginPeriodConfirmation: confirmationState.beginConfirmation,
    clearPeriodConfirmation: confirmationState.clear,
    confirmPeriodUpdateEffect,
    createInitialPeriodEffect,
    getConfirmSaving: () => confirmationState.confirmSaving,
    getRangeEndDate: () => rangeEndDate,
    getRangeStartDate: () => rangeStartDate,
    getSummary: () => summary,
    refreshSummaryEffect,
    savePeriodUpdateEffect,
    setCreateEndDate: (value) => (createEndDate = value),
    setCreatePeriodId: (value) => (createPeriodId = value),
    setCreateStartDate: (value) => (createStartDate = value),
    setRangeEndDate: (value) => (rangeEndDate = value),
    setRangeStartDate: (value) => (rangeStartDate = value),
  });

  return {
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
      return periodSaving;
    },
    get confirmSaving() {
      return confirmationState.confirmSaving;
    },
    get periodUpdateProposal() {
      return confirmationState.pending?.proposal ?? null;
    },
    get periodInteractionDisabled() {
      return (
        periodSaving ||
        confirmationState.confirmSaving ||
        confirmationState.pending != null
      );
    },
    get periodError() {
      return periodError;
    },
    get rangeStartDate() {
      return rangeStartDate;
    },
    get rangeEndDate() {
      return rangeEndDate;
    },
    get createStartDate() {
      return createStartDate;
    },
    get createEndDate() {
      return createEndDate;
    },
    get createPeriodId() {
      return createPeriodId;
    },
    set createPeriodId(value: string) {
      createPeriodId = value;
    },
    get createBudgetInput() {
      return createBudgetInput;
    },
    set createBudgetInput(value: string) {
      createBudgetInput = value;
    },
    setSummary(nextSummary: PeriodSummary | null): void {
      summary = nextSummary;
      confirmationState.dropIfStale();
    },
    handleSavePeriod: actions.handleSavePeriod,
    handleRangeChange: actions.handleRangeChange,
    handleSelectPeriod: actions.handleSelectPeriod,
    confirmPeriodUpdate: actions.confirmPeriodUpdate,
    cancelPeriodUpdateConfirmation: actions.cancelPeriodUpdateConfirmation,
    createInitialPeriod: actions.createInitialPeriod,
    updateCreatePeriodRange: actions.updateCreatePeriodRange,
  };
}
