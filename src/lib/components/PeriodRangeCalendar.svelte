<script lang="ts">
  import { RangeCalendar } from "bits-ui";
  import type { PeriodRange } from "./period-range-state";

  type Props = {
    range: PeriodRange;
    disabled?: boolean;
    valueChange?: (_value: PeriodRange) => void;
  };

  let { range, disabled = false, valueChange = () => {} }: Props = $props();
</script>

<RangeCalendar.Root
  value={range}
  onValueChange={valueChange}
  locale="ja-JP"
  weekdayFormat="short"
  fixedWeeks={true}
  {disabled}
  calendarLabel="予算期間"
>
  {#snippet children({ months, weekdays })}
    <RangeCalendar.Header>
      <RangeCalendar.PrevButton aria-label="前の月">←</RangeCalendar.PrevButton>
      <RangeCalendar.Heading />
      <RangeCalendar.NextButton aria-label="次の月">→</RangeCalendar.NextButton>
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
                  <RangeCalendar.Day />
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
  :global([data-range-calendar-root]) {
    display: grid;
    gap: 0.65rem;
    max-width: 24rem;
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
    height: 2.1rem;
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

  :global([data-range-calendar-day]) {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 0;
    color: inherit;
    display: inline-flex;
    font: inherit;
    font-weight: 800;
    height: 2.1rem;
    justify-content: center;
    min-height: 0;
    padding: 0;
    width: 100%;
  }

  :global([data-range-calendar-day][data-selected]) {
    background: #dcefd7;
    color: #245f31;
  }

  :global([data-range-calendar-day][data-outside-month]) {
    color: #b5a89b;
  }

  @media (max-width: 760px) {
    :global([data-range-calendar-root]) {
      max-width: 100%;
    }

    :global([data-range-calendar-head-cell]),
    :global([data-range-calendar-cell]),
    :global([data-range-calendar-day]) {
      height: 1.95rem;
    }
  }
</style>
