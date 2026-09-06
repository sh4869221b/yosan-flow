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
  type PeriodRefreshError,
} from "$lib/dashboard/period-controller-update-effect";
import { getInitialPeriodControllerState } from "$lib/dashboard/period-controller-initial-state";
import { createPeriodUpdateConfirmationState } from "$lib/dashboard/period-update-confirmation-state.svelte";
import { createPeriodSummaryRequestTracker } from "$lib/dashboard/period-summary-request-tracker";
import { createPeriodSummaryRevision } from "$lib/dashboard/period-summary-revision";
import {
  createPeriodSettingsState,
  type PeriodSettingsSubmission,
} from "$lib/dashboard/period-settings-state.svelte";
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
  let createStartDate = $state(initialState.createStartDate);
  let createEndDate = $state(addDays(initialState.createStartDate, 29));
  let createPeriodId = $state(toPeriodId(initialState.createStartDate));
  let createBudgetInput = $state("120000");
  const confirmationState = createPeriodUpdateConfirmationState({
    getSelectedPeriodId: () => selectedPeriodId,
    summaryRevision,
  });

  const interactionDisabled = () =>
    settings.budget.saving ||
    settings.range.saving ||
    periodSaving ||
    confirmationState.confirmSaving ||
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

  function refreshSummaryEffect(
    periodId: string,
    reportError: PeriodRefreshError = true,
    submission?: PeriodSettingsSubmission,
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
        if (summaryRequests.owns(request))
          yield* refreshSummaryEffect(periodId, reportError, submission);
        return;
      }
      const result = yield* fetchJsonEffect<PeriodSummary>(
        periodSummaryUrl(periodId),
        undefined,
        "再取得に失敗しました。",
      ).pipe(Effect.either);
      if (summaryRequests.isFresh(request)) {
        if (result._tag === "Left") {
          if (typeof reportError === "function") reportError(result.left);
          else if (reportError) summaryError = result.left;
        } else if (result.right.periodId === periodId) {
          publishSummary(result.right, submission);
        }
      }
      if (summaryRequests.owns(request)) summaryLoading = false;
    });
  }

  function refreshPeriodListEffect(
    preferredPeriodId?: string,
    reportSummaryError: PeriodRefreshError = true,
    submission?: PeriodSettingsSubmission,
  ): Effect.Effect<void | boolean, string> {
    const request = summaryRequests.start(
      preferredPeriodId ?? selectedPeriodId,
    );
    summaryLoading = false;
    return Effect.gen(function* () {
      const result = yield* fetchJsonEffect<PeriodListResponse<PeriodOption>>(
        periodsUrl(),
        undefined,
        "保存に失敗しました。",
      ).pipe(Effect.either);
      if (!summaryRequests.owns(request)) return false;
      if (result._tag === "Left") return yield* Effect.fail(result.left);
      periods = result.right.periods ?? [];
      if (periods.length === 0) {
        selectedPeriodId = null;
        publishSummary(null);
        return;
      }
      const matched =
        periods.find((period) => period.id === preferredPeriodId) ??
        periods.find((period) => period.id === selectedPeriodId) ??
        periods[periods.length - 1];
      yield* refreshSummaryEffect(matched.id, reportSummaryError, submission);
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
    setError: settings.setError,
    setSaving: settings.setSaving,
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
      refreshPeriodListEffect: (id) =>
        refreshPeriodListEffect(id).pipe(Effect.asVoid),
      setError: (error) => (periodError = error),
      setSaving: (saving) => (periodSaving = saving),
    });
  }

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
      return periodSaving;
    },
    get confirmSaving() {
      return confirmationState.confirmSaving;
    },
    get periodUpdateProposal() {
      return confirmationState.pending?.proposal ?? null;
    },
    get periodInteractionDisabled() {
      return interactionDisabled();
    },
    get periodError() {
      return periodError;
    },
    get rangeStartDate() {
      return settings.range.draft.startDate;
    },
    get rangeEndDate() {
      return settings.range.draft.endDate;
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
      settings.adopt(nextSummary);
      summary = nextSummary;
      if (nextSummary == null) confirmationState.clear();
      else confirmationState.dropIfStale();
    },
    ...createPeriodControllerActions({
      beginPeriodConfirmation: confirmationState.beginConfirmation,
      clearPeriodConfirmation: confirmationState.clear,
      confirmPeriodUpdateEffect,
      createInitialPeriodEffect,
      getConfirmSaving: () => confirmationState.confirmSaving,
      settings,
      getInteractionDisabled: interactionDisabled,
      getSummaryLoading: () => summaryLoading,
      setCreateSaving: (saving) => (periodSaving = saving),
      getSummary: () => summary,
      refreshSummaryEffect,
      savePeriodUpdateEffect,
      setCreateEndDate: (value) => (createEndDate = value),
      setCreatePeriodId: (value) => (createPeriodId = value),
      setCreateStartDate: (value) => (createStartDate = value),
    }),
  };
}
