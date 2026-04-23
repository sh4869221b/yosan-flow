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

  const dispatch = createEventDispatcher<{ change: { startDate: string; endDate: string } }>();

  let range: DateRange = {
    start: toDateValue(startDate),
    end: toDateValue(endDate)
  };

  $: {
    const nextStart = toDateValue(startDate);
    const nextEnd = toDateValue(endDate);
    const currentStart = range.start?.toString() ?? "";
    const currentEnd = range.end?.toString() ?? "";
    if (currentStart !== (nextStart?.toString() ?? "") || currentEnd !== (nextEnd?.toString() ?? "")) {
      range = {
        start: nextStart,
        end: nextEnd
      };
    }
  }

  $: selectedStartDate = range.start?.toString() ?? "";
  $: selectedEndDate = range.end?.toString() ?? "";

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

  function submitPeriodRange(): void {
    if (!selectedStartDate || !selectedEndDate) {
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
      <input type="text" readonly value={selectedStartDate} />
    </label>
    <label>
      終了日
      <input type="text" readonly value={selectedEndDate} />
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
    data-testid="period-range-apply"
    disabled={saving || !selectedStartDate || !selectedEndDate}
    on:click={submitPeriodRange}
  >
    {saving ? "保存中..." : "期間を反映"}
  </button>
</section>
