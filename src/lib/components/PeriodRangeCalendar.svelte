<script lang="ts">
  import { RangeCalendar } from "bits-ui";
  import type { DateValue } from "@internationalized/date";
  import type { PeriodRange } from "./period-range-state";

  type Props = {
    range: PeriodRange;
    disabled?: boolean;
    valueChange?: (_value: PeriodRange) => void;
  };

  let { range, disabled = false, valueChange = () => {} }: Props = $props();

  let selectedStart = $state<DateValue | undefined>();
  let selectedEnd = $state<DateValue | undefined>();

  $effect(() => {
    selectedStart = range.start;
    selectedEnd = range.end;
  });

  function datesMatch(
    left: DateValue | undefined,
    right: DateValue | undefined,
  ): boolean {
    return left?.toString() === right?.toString();
  }

  function rangesMatch(left: PeriodRange, right: PeriodRange): boolean {
    return (
      datesMatch(left.start, right.start) && datesMatch(left.end, right.end)
    );
  }

  function publish(nextRange: PeriodRange): void {
    if (!disabled && !rangesMatch(nextRange, range)) {
      valueChange(nextRange);
    }
  }

  function handleStartValueChange(start: DateValue | undefined): void {
    selectedStart = start;
    selectedEnd = undefined;

    if (!datesMatch(start, range.start)) {
      publish({ start, end: undefined });
      return;
    }

    queueMicrotask(() => {
      const nextRange = { start: selectedStart, end: selectedEnd };
      if (!rangesMatch(nextRange, range)) {
        publish(nextRange);
      }
    });
  }

  function handleEndValueChange(end: DateValue | undefined): void {
    selectedEnd = end;
  }

  function handleValueChange(nextRange: PeriodRange): void {
    if (
      nextRange.start &&
      nextRange.end &&
      rangesMatch(nextRange, { start: selectedStart, end: selectedEnd })
    ) {
      publish(nextRange);
    }
  }
</script>

<RangeCalendar.Root
  value={range}
  onValueChange={handleValueChange}
  onStartValueChange={handleStartValueChange}
  onEndValueChange={handleEndValueChange}
  locale="ja-JP"
  weekdayFormat="short"
  fixedWeeks={true}
  preventDeselect={true}
  {disabled}
  calendarLabel="予算期間"
  class="period-range-calendar"
>
  {#snippet children({ months, weekdays })}
    <RangeCalendar.Header>
      <RangeCalendar.PrevButton>
        {#snippet child({ props })}
          <button
            {...props}
            class="range-calendar-nav"
            aria-label="前の月"
            {disabled}>←</button
          >
        {/snippet}
      </RangeCalendar.PrevButton>
      <RangeCalendar.Heading />
      <RangeCalendar.NextButton>
        {#snippet child({ props })}
          <button
            {...props}
            class="range-calendar-nav"
            aria-label="次の月"
            {disabled}>→</button
          >
        {/snippet}
      </RangeCalendar.NextButton>
    </RangeCalendar.Header>

    {#each months as month (month.value.toString())}
      <RangeCalendar.Grid>
        <RangeCalendar.GridHead>
          <RangeCalendar.GridRow>
            {#each weekdays as weekday (weekday)}
              <RangeCalendar.HeadCell>{weekday}</RangeCalendar.HeadCell>
            {/each}
          </RangeCalendar.GridRow>
        </RangeCalendar.GridHead>
        <RangeCalendar.GridBody>
          {#each month.weeks as weekDates, weekIndex (`${month.value.toString()}-${weekIndex}`)}
            <RangeCalendar.GridRow>
              {#each weekDates as date (date.toString())}
                <RangeCalendar.Cell {date} month={month.value}>
                  <RangeCalendar.Day class="range-calendar-day" />
                </RangeCalendar.Cell>
              {/each}
            </RangeCalendar.GridRow>
          {/each}
        </RangeCalendar.GridBody>
      </RangeCalendar.Grid>
    {/each}
  {/snippet}
</RangeCalendar.Root>

<style>
  :global(.period-range-calendar) {
    display: grid;
    gap: 0.65rem;
    max-width: 24rem;
    width: 100%;
  }

  :global([data-range-calendar-header]) {
    align-items: center;
    display: grid;
    gap: 0.75rem;
    grid-template-columns: auto 1fr auto;
  }

  :global([data-range-calendar-heading]) {
    color: #2f2219;
    font-size: 1.1rem;
    font-weight: 900;
    text-align: center;
  }

  :global([data-range-calendar-grid]) {
    border: 1px solid #e6ded4;
    border-collapse: separate;
    border-radius: 10px;
    border-spacing: 0;
    overflow: hidden;
    table-layout: fixed;
    width: 100%;
  }

  :global([data-range-calendar-head-cell]),
  :global([data-range-calendar-cell]) {
    border-bottom: 1px solid #e6ded4;
    border-right: 1px solid #e6ded4;
    color: #2f2219;
    font-weight: 800;
    height: 2.65rem;
    padding: 0;
    text-align: center;
    width: 14.285%;
  }

  :global([data-range-calendar-head-cell]:last-child),
  :global([data-range-calendar-cell]:last-child) {
    border-right: 0;
  }

  :global(
    [data-range-calendar-grid-row]:last-child [data-range-calendar-cell]
  ) {
    border-bottom: 0;
  }

  :global(.range-calendar-day) {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 0;
    color: inherit;
    display: inline-flex;
    font: inherit;
    font-weight: 800;
    height: 2.65rem;
    justify-content: center;
    min-height: 0;
    padding: 0;
    width: 100%;
  }

  :global(.range-calendar-day[data-selected]) {
    background: #dcefd7;
    color: #245f31;
  }

  :global(.range-calendar-day[data-outside-month]) {
    color: #b5a89b;
  }

  :global(.range-calendar-nav) {
    align-items: center;
    border: 1px solid #ded3c6;
    border-radius: 8px;
    color: #2f2219;
    display: inline-flex;
    height: 2.65rem;
    justify-content: center;
    padding: 0;
    width: 2.65rem;
  }

  :global(.range-calendar-nav:focus-visible),
  :global(.range-calendar-day:focus-visible) {
    outline: 3px solid #245f31;
    outline-offset: -3px;
  }
</style>
