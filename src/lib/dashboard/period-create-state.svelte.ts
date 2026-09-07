import { addDays, toPeriodId } from "$lib/dashboard/date";

type CreateRange = Readonly<{ endDate: string; startDate: string }>;
type InitialState = Readonly<{ startDate: string }>;

export function createPeriodCreateState(initialState: InitialState) {
  let createStartDate = $state(initialState.startDate);
  let createEndDate = $state(addDays(initialState.startDate, 29));
  let createPeriodId = $state(toPeriodId(initialState.startDate));
  let createBudgetInput = $state("120000");
  let manuallyEditedPeriodId = $state(false);
  let createSaving = $state(false);
  let createError = $state<string | null>(null);
  const recovery = $state({
    createdRefreshing: false,
    createdPeriodId: null as string | null,
    createdRefreshPending: false,
  });

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
      if (value !== createPeriodId) manuallyEditedPeriodId = true;
      createPeriodId = value;
    },
    get createBudgetInput() {
      return createBudgetInput;
    },
    set createBudgetInput(value: string) {
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
    updateRange(range: CreateRange): void {
      createStartDate = range.startDate;
      createEndDate = range.endDate;
      if (!manuallyEditedPeriodId) createPeriodId = toPeriodId(range.startDate);
    },
  };
}

export type PeriodCreateState = ReturnType<typeof createPeriodCreateState>;
