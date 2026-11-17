import {
  parsePeriodRangeInput,
  type PeriodRange,
} from "#lib/components/period-range-state.ts";
import { parseNonNegativeIntegerYenInput } from "#lib/dashboard/yen-input.ts";
import { addDays } from "#lib/utc-date.ts";

type CreateRange = Readonly<{ endDate: string; startDate: string }>;
type InitialState = Readonly<{ startDate: string }>;

export function createPeriodCreateState(initialState: InitialState) {
  const defaults = {
    startDate: initialState.startDate,
    endDate: addDays(initialState.startDate, 29),
    periodId: `p-${initialState.startDate}`,
    budgetInput: "120000",
  };
  const defaultRangeInput = parsePeriodRangeInput(defaults);
  let createRangeInput = $state.raw(defaultRangeInput);
  let createPeriodId = $state(defaults.periodId);
  let createBudgetInput = $state(defaults.budgetInput);
  let createBudgetValue = $state<number | null>(120000);
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
      return createRangeInput.draft.startDate;
    },
    get createEndDate() {
      return createRangeInput.draft.endDate;
    },
    get createRangeInput() {
      return createRangeInput;
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
      if (value === createBudgetInput) return;
      recordDraftEdit();
      createBudgetInput = value;
      createBudgetValue = parseNonNegativeIntegerYenInput(value);
    },
    get createBudgetValue() {
      return createBudgetValue;
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
      createRangeInput = defaultRangeInput;
      createPeriodId = defaults.periodId;
      createBudgetInput = defaults.budgetInput;
      createBudgetValue = 120000;
      manuallyEditedPeriodId = false;
      createError = null;
      recovery.createdPeriodId = null;
    },
    updateRange(range: CreateRange, calendarRange?: PeriodRange): void {
      if (
        range.startDate !== createRangeInput.draft.startDate ||
        range.endDate !== createRangeInput.draft.endDate
      ) {
        recordDraftEdit();
      }
      createRangeInput = parsePeriodRangeInput(
        range,
        createRangeInput,
        calendarRange,
      );
      if (!manuallyEditedPeriodId) createPeriodId = `p-${range.startDate}`;
    },
  };
}

export type PeriodCreateState = ReturnType<typeof createPeriodCreateState>;
