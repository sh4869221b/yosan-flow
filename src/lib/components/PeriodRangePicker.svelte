<script lang="ts">
  import PeriodRangeCalendar from "./PeriodRangeCalendar.svelte";
  import PeriodRangeInputRow from "./PeriodRangeInputRow.svelte";
  import {
    createPeriodRange,
    getPeriodRangeSelection,
    updatePeriodRangeInput,
    type PeriodRange,
    type PeriodRangeField,
  } from "./period-range-state";

  type Props = {
    startDate?: string;
    endDate?: string;
    saving?: boolean;
    testIdPrefix?: string;
    change?: (_payload: { startDate: string; endDate: string }) => void;
  };

  let {
    startDate = "",
    endDate = "",
    saving = false,
    testIdPrefix = "period-range",
    change = () => {},
  }: Props = $props();

  function getInitialRangeProps(): { startDate: string; endDate: string } {
    return { startDate, endDate };
  }

  const initialRangeProps = getInitialRangeProps();

  let range = $state<PeriodRange>(createPeriodRange(initialRangeProps));
  let syncedStartDate = $state(initialRangeProps.startDate);
  let syncedEndDate = $state(initialRangeProps.endDate);

  $effect(() => {
    if (startDate === syncedStartDate && endDate === syncedEndDate) {
      return;
    }
    syncedStartDate = startDate;
    syncedEndDate = endDate;
    range = createPeriodRange({ startDate, endDate });
  });

  const selection = $derived(getPeriodRangeSelection(range));

  function handleValueChange(value: PeriodRange): void {
    range = value;
  }

  function handleDateInput(payload: {
    readonly field: PeriodRangeField;
    readonly value: string;
  }): void {
    range = updatePeriodRangeInput(range, payload.field, payload.value);
  }

  function submitPeriodRange(): void {
    if (!selection.isValid) {
      return;
    }
    change({
      startDate: selection.startDate,
      endDate: selection.endDate,
    });
  }
</script>

<section>
  <h2>期間設定</h2>
  <PeriodRangeInputRow
    selectedStartDate={selection.startDate}
    selectedEndDate={selection.endDate}
    {saving}
    {testIdPrefix}
    input={handleDateInput}
  />

  <PeriodRangeCalendar {range} valueChange={handleValueChange} />

  <button
    type="button"
    data-testid={`${testIdPrefix}-apply`}
    disabled={saving || !selection.isValid}
    onclick={submitPeriodRange}
  >
    {saving ? "保存中..." : "期間を反映"}
  </button>
</section>

<style>
  section {
    display: grid;
    gap: 0.85rem;
  }

  h2 {
    color: #2f2219;
    font-size: clamp(1.25rem, 2vw, 1.55rem);
    letter-spacing: 0;
    line-height: 1.15;
    margin: 0;
  }

  button {
    background: #2f6d3b;
    border: 0;
    border-radius: 8px;
    box-sizing: border-box;
    color: #fff;
    cursor: pointer;
    font: inherit;
    font-weight: 800;
    max-width: 100%;
    min-height: 2.65rem;
    padding: 0 1rem;
  }

  button:disabled {
    cursor: wait;
    opacity: 0.65;
  }
</style>
