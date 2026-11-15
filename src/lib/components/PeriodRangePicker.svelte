<script lang="ts">
  import PeriodRangeCalendar from "./PeriodRangeCalendar.svelte";
  import PeriodRangeInputRow from "./PeriodRangeInputRow.svelte";
  import type { PeriodRange, PeriodRangeField } from "./period-range-state";

  type Props = {
    value: { readonly startDate: string; readonly endDate: string };
    calendarValue: PeriodRange;
    onValueChange: (
      _value: { startDate: string; endDate: string },
      _calendarRange?: PeriodRange,
    ) => void;
    onFieldBlur: (_field: PeriodRangeField) => void;
    disabled: boolean;
    startId: string;
    endId: string;
    startError: string | null;
    endError: string | null;
    rangeError: string | null;
    testIdPrefix: string;
  };

  let {
    value,
    calendarValue,
    onValueChange,
    onFieldBlur,
    disabled,
    startId,
    endId,
    startError,
    endError,
    rangeError,
    testIdPrefix,
  }: Props = $props();

  function handleDateInput(payload: {
    readonly field: PeriodRangeField;
    readonly value: string;
  }): void {
    onValueChange({
      ...value,
      [payload.field === "start" ? "startDate" : "endDate"]: payload.value,
    });
  }

  function handleCalendarChange(range: PeriodRange): void {
    onValueChange(
      {
        startDate: range.start?.toString() ?? "",
        endDate: range.end?.toString() ?? "",
      },
      range,
    );
  }
</script>

<div class="period-range-picker">
  <PeriodRangeInputRow
    {value}
    {disabled}
    {startId}
    {endId}
    {startError}
    {endError}
    {rangeError}
    {testIdPrefix}
    onValueChange={handleDateInput}
    {onFieldBlur}
  />

  <PeriodRangeCalendar
    range={calendarValue}
    {disabled}
    valueChange={handleCalendarChange}
  />
</div>

<style>
  .period-range-picker {
    display: grid;
    gap: 0.85rem;
  }
</style>
