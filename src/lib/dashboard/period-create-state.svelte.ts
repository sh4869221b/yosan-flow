import { addDays, toPeriodId } from "$lib/dashboard/date";

type CreateRange = Readonly<{ endDate: string; startDate: string }>;
type InitialState = Readonly<{ startDate: string }>;

export function createPeriodCreateState(initialState: InitialState) {
  const defaults = {
    startDate: initialState.startDate,
    endDate: addDays(initialState.startDate, 29),
    periodId: toPeriodId(initialState.startDate),
    budgetInput: "120000",
  };
  let createStartDate = $state(defaults.startDate);
  let createEndDate = $state(defaults.endDate);
  let createPeriodId = $state(defaults.periodId);
  let createBudgetInput = $state(defaults.budgetInput);
  let manuallyEditedPeriodId = $state(false);
  let createSaving = $state(false);
  let createError = $state<string | null>(null);
  const recovery = $state({
    createdRefreshing: false,
    createdPeriodId: null as string | null,
    createdRefreshPending: false,
  });

  function recordDraftEdit(): void {
    createError = null;
    if (!recovery.createdRefreshPending && recovery.createdPeriodId != null) {
      recovery.createdPeriodId = null;
    }
  }

  return {
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
      if (value !== createPeriodId) {
        manuallyEditedPeriodId = true;
        recordDraftEdit();
      }
      createPeriodId = value;
    },
    get createBudgetInput() {
      return createBudgetInput;
    },
    set createBudgetInput(value: string) {
      if (value !== createBudgetInput) recordDraftEdit();
      createBudgetInput = value;
    },
    get createSaving() {
      return createSaving;
    },
    get createdRefreshing() {
      return recovery.createdRefreshing;
    },
    get createError() {
      return createError;
    },
    get createdPeriodId() {
      return recovery.createdPeriodId;
    },
    get createdRefreshPending() {
      return recovery.createdRefreshPending;
    },
    get periodSaving() {
      return createSaving || recovery.createdRefreshing;
    },
    get periodError() {
      return createError;
    },
    setSaving(value: boolean): void {
      createSaving = value;
    },
    setError(value: string | null): void {
      createError = value;
    },
    setCreatedRefreshing(value: boolean): void {
      recovery.createdRefreshing = value;
    },
    retainCreatedPeriod(periodId: string): void {
      recovery.createdPeriodId = periodId;
      recovery.createdRefreshPending = true;
    },
    completeCreatedRefresh(periodId: string): void {
      if (recovery.createdPeriodId === periodId) {
        recovery.createdRefreshPending = false;
      }
    },
    resetDraft(): void {
      createStartDate = defaults.startDate;
      createEndDate = defaults.endDate;
      createPeriodId = defaults.periodId;
      createBudgetInput = defaults.budgetInput;
      manuallyEditedPeriodId = false;
      createError = null;
      recovery.createdPeriodId = null;
    },
    updateRange(range: CreateRange): void {
      if (
        range.startDate !== createStartDate ||
        range.endDate !== createEndDate
      ) {
        recordDraftEdit();
      }
      createStartDate = range.startDate;
      createEndDate = range.endDate;
      if (!manuallyEditedPeriodId) createPeriodId = toPeriodId(range.startDate);
    },
  };
}

export type PeriodCreateState = ReturnType<typeof createPeriodCreateState>;
