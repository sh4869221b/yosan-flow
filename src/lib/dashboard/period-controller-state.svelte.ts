import { Effect } from "effect";
import { periodSummaryUrl, periodsUrl } from "$lib/dashboard/api-urls";
import { fetchJsonEffect } from "$lib/dashboard/fetch-json";
import type {
  PeriodOption,
  PeriodSummary,
} from "$lib/dashboard/controller-types";
import { addDays, toPeriodId } from "$lib/dashboard/date";
import { createPeriodControllerActions } from "$lib/dashboard/period-controller-actions.svelte";
import { getInitialPeriodControllerState } from "$lib/dashboard/period-controller-initial-state";
import { parseNonNegativeIntegerYenInput } from "$lib/dashboard/yen-input";
import { createPeriodSummaryRevision } from "$lib/dashboard/period-summary-revision";
import type {
  PeriodCreateResponse,
  PeriodListResponse,
  SavePeriodPayload,
} from "$lib/dashboard/types";
import type { PageData } from "../../routes/$types";

export function createPeriodControllerState(
  data: PageData,
  summaryRevision = createPeriodSummaryRevision(),
) {
  const initialState = getInitialPeriodControllerState(data);

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

  function publishSummary(nextSummary: PeriodSummary | null): void {
    if (nextSummary != null) {
      summaryRevision.advance(nextSummary.periodId);
    }
    summary = nextSummary;
  }

  $effect(() => {
    if (summary == null) {
      return;
    }
    selectedPeriodId = summary.periodId;
    rangeStartDate = summary.startDate;
    rangeEndDate = summary.endDate;
  });

  function refreshSummaryEffect(periodId: string): Effect.Effect<void, never> {
    return Effect.gen(function* () {
      summaryLoading = true;
      summaryError = null;
      const result = yield* fetchJsonEffect<PeriodSummary>(
        periodSummaryUrl(periodId),
        undefined,
        "再取得に失敗しました。",
      ).pipe(Effect.either);
      if (result._tag === "Left") {
        summaryError = result.left;
      } else {
        publishSummary(result.right);
      }
      summaryLoading = false;
    });
  }

  function refreshPeriodListEffect(
    preferredPeriodId?: string,
  ): Effect.Effect<void, string> {
    return Effect.gen(function* () {
      const body = yield* fetchJsonEffect<PeriodListResponse<PeriodOption>>(
        periodsUrl(),
        undefined,
        "保存に失敗しました。",
      );
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
      selectedPeriodId = matched.id;
      yield* refreshSummaryEffect(matched.id);
    });
  }

  function savePeriodUpdateEffect(
    payload: SavePeriodPayload,
  ): Effect.Effect<void, never> {
    if (selectedPeriodId == null || summaryLoading) {
      return Effect.void;
    }
    const periodId = selectedPeriodId;
    return Effect.gen(function* () {
      periodSaving = true;
      periodError = null;
      const result = yield* fetchJsonEffect<PeriodSummary>(
        periodSummaryUrl(periodId),
        {
          body: JSON.stringify(payload),
          headers: { "content-type": "application/json" },
          method: "PUT",
        },
        "保存に失敗しました。",
      ).pipe(Effect.either);
      if (result._tag === "Left") {
        periodError = result.left;
      } else {
        publishSummary(result.right);
        const refreshResult = yield* refreshPeriodListEffect(
          result.right.periodId,
        ).pipe(Effect.either);
        if (refreshResult._tag === "Left") {
          periodError = refreshResult.left;
        }
      }
      periodSaving = false;
    });
  }

  function createInitialPeriodEffect(): Effect.Effect<void, never> {
    const budgetYen = parseNonNegativeIntegerYenInput(createBudgetInput);
    if (budgetYen == null) {
      periodError = "予算は 0 以上の整数で入力してください。";
      return Effect.void;
    }
    return Effect.gen(function* () {
      periodSaving = true;
      periodError = null;
      const latestPeriod = periods[periods.length - 1] ?? null;
      const predecessorPeriodId =
        latestPeriod != null &&
        addDays(latestPeriod.endDate, 1) === createStartDate
          ? latestPeriod.id
          : null;
      const result = yield* fetchJsonEffect<PeriodCreateResponse>(
        periodsUrl(),
        {
          body: JSON.stringify({
            budgetYen,
            endDate: createEndDate,
            id: createPeriodId,
            predecessorPeriodId,
            startDate: createStartDate,
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        },
        "期間作成に失敗しました。",
      ).pipe(Effect.either);
      if (result._tag === "Left") {
        periodError = result.left;
      } else {
        const refreshResult = yield* refreshPeriodListEffect(
          result.right.id,
        ).pipe(Effect.either);
        if (refreshResult._tag === "Left") {
          periodError = refreshResult.left;
        }
      }
      periodSaving = false;
    });
  }

  const actions = createPeriodControllerActions({
    createInitialPeriodEffect,
    getRangeEndDate: () => rangeEndDate,
    getRangeStartDate: () => rangeStartDate,
    getSummary: () => summary,
    refreshSummaryEffect,
    savePeriodUpdateEffect,
    setCreateEndDate: (value) => {
      createEndDate = value;
    },
    setCreatePeriodId: (value) => {
      createPeriodId = value;
    },
    setCreateStartDate: (value) => {
      createStartDate = value;
    },
    setRangeEndDate: (value) => {
      rangeEndDate = value;
    },
    setRangeStartDate: (value) => {
      rangeStartDate = value;
    },
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
    },
    handleSavePeriod: actions.handleSavePeriod,
    handleRangeChange: actions.handleRangeChange,
    handleSelectPeriod: actions.handleSelectPeriod,
    createInitialPeriod: actions.createInitialPeriod,
    updateCreatePeriodRange: actions.updateCreatePeriodRange,
  };
}
