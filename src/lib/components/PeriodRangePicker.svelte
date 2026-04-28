<script lang="ts">
  import { RangeCalendar } from "bits-ui";
  import { parseDate, type DateValue } from "@internationalized/date";
  import { createEventDispatcher } from "svelte";

  type DateRange = {
    start: DateValue | undefined;
    end: DateValue | undefined;
  };

  export let startDate = "";
  export let endDate = "";
  export let saving = false;
  export let testIdPrefix = "period-range";

  const dispatch = createEventDispatcher<{ change: { startDate: string; endDate: string } }>();

  let range: DateRange = {
    start: toDateValue(startDate),
    end: toDateValue(endDate)
  };
  let syncedStartDate = startDate;
  let syncedEndDate = endDate;

  $: {
    if (startDate !== syncedStartDate || endDate !== syncedEndDate) {
      syncedStartDate = startDate;
      syncedEndDate = endDate;
      range = {
        start: toDateValue(startDate),
        end: toDateValue(endDate)
      };
    }
  }

  $: selectedStartDate = range.start?.toString() ?? "";
  $: selectedEndDate = range.end?.toString() ?? "";
  $: isRangeValid = Boolean(selectedStartDate && selectedEndDate && selectedStartDate <= selectedEndDate);

  function toDateValue(value: string): DateValue | undefined {
    if (!value) {
      return undefined;
    }
    try {
      return parseDate(value);
    } catch {
      return undefined;
    }
  }

  function handleValueChange(value: DateRange): void {
    range = value;
  }

  function handleDateInput(field: "start" | "end", value: string): void {
    range = {
      ...range,
      [field]: toDateValue(value)
    };
  }

  function submitPeriodRange(): void {
    if (!isRangeValid) {
      return;
    }
    dispatch("change", {
      startDate: selectedStartDate,
      endDate: selectedEndDate
    });
  }
</script>

<section>
  <h2>期間設定</h2>
  <p>
    <label>
      開始日
      <input
        type="date"
        data-testid={`${testIdPrefix}-start`}
        value={selectedStartDate}
        max={selectedEndDate || undefined}
        disabled={saving}
        on:input={(event) => handleDateInput("start", event.currentTarget.value)}
      />
    </label>
    <label>
      終了日
      <input
        type="date"
        data-testid={`${testIdPrefix}-end`}
        value={selectedEndDate}
        min={selectedStartDate || undefined}
        disabled={saving}
        on:input={(event) => handleDateInput("end", event.currentTarget.value)}
      />
    </label>
  </p>

  <RangeCalendar.Root
    value={range}
    onValueChange={handleValueChange}
    locale="ja-JP"
    weekdayFormat="short"
    fixedWeeks={true}
    calendarLabel="予算期間"
  >
    {#snippet children({ months, weekdays })}
      <RangeCalendar.Header>
        <RangeCalendar.PrevButton aria-label="前の月">←</RangeCalendar.PrevButton>
        <RangeCalendar.Heading />
        <RangeCalendar.NextButton aria-label="次の月">→</RangeCalendar.NextButton>
      </RangeCalendar.Header>

      {#each months as month}
        <RangeCalendar.Grid>
          <RangeCalendar.GridHead>
            <RangeCalendar.GridRow>
              {#each weekdays as weekday}
                <RangeCalendar.HeadCell>{weekday}</RangeCalendar.HeadCell>
              {/each}
            </RangeCalendar.GridRow>
          </RangeCalendar.GridHead>
          <RangeCalendar.GridBody>
            {#each month.weeks as weekDates}
              <RangeCalendar.GridRow>
                {#each weekDates as date}
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

  <button
    type="button"
    data-testid={`${testIdPrefix}-apply`}
    disabled={saving || !isRangeValid}
    on:click={submitPeriodRange}
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

  p {
    align-items: end;
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin: 0;
  }

  label {
    color: #4d4036;
    display: grid;
    flex: 1 1 11rem;
    font-weight: 700;
    gap: 0.35rem;
    min-width: 0;
  }

  input {
    background: #fff;
    border: 1px solid #ded3c6;
    border-radius: 8px;
    box-sizing: border-box;
    color: #2f2219;
    font: inherit;
    max-width: 100%;
    min-height: 2.65rem;
    padding: 0 0.85rem;
    width: 100%;
  }

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

  :global([data-range-calendar-grid-row]:last-child [data-range-calendar-cell]) {
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
