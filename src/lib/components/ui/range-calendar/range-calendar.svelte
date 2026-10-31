<script lang="ts">
  import { RangeCalendar as RangeCalendarPrimitive } from "bits-ui";
  import { cn } from "#lib/utils.ts";
  import RangeCalendarCell from "./range-calendar-cell.svelte";
  import RangeCalendarDay from "./range-calendar-day.svelte";
  import RangeCalendarGridBody from "./range-calendar-grid-body.svelte";
  import RangeCalendarGridHead from "./range-calendar-grid-head.svelte";
  import RangeCalendarGridRow from "./range-calendar-grid-row.svelte";
  import RangeCalendarGrid from "./range-calendar-grid.svelte";
  import RangeCalendarHeadCell from "./range-calendar-head-cell.svelte";
  import RangeCalendarHeader from "./range-calendar-header.svelte";
  import RangeCalendarHeading from "./range-calendar-heading.svelte";
  import RangeCalendarNavButton from "./range-calendar-nav-button.svelte";

  let {
    ref = $bindable(null),
    value = $bindable(),
    placeholder = $bindable(),
    weekdayFormat = "short",
    class: className,
    locale = "en-US",
    previousLabel = "Previous month",
    nextLabel = "Next month",
    disabled = false,
    ...restProps
  }: Omit<RangeCalendarPrimitive.RootProps, "children" | "child"> & {
    previousLabel?: string;
    nextLabel?: string;
  } = $props();
</script>

<RangeCalendarPrimitive.Root
  bind:ref
  bind:value
  bind:placeholder
  {weekdayFormat}
  {locale}
  {disabled}
  class={cn(
    "group/calendar grid w-full min-w-0 max-w-96 gap-3 [--cell-radius:var(--radius-md)] [--cell-size:max(var(--control-height),2.625rem)]",
    className,
  )}
  {...restProps}
>
  {#snippet children({ months, weekdays })}
    <RangeCalendarHeader>
      <RangeCalendarNavButton
        direction="previous"
        aria-label={previousLabel}
        {disabled}
      />
      <RangeCalendarHeading />
      <RangeCalendarNavButton
        direction="next"
        aria-label={nextLabel}
        {disabled}
      />
    </RangeCalendarHeader>
    {#each months as month (month.value.toString())}
      <RangeCalendarGrid>
        <RangeCalendarGridHead>
          <RangeCalendarGridRow>
            {#each weekdays as weekday, index (index)}
              <RangeCalendarHeadCell>{weekday}</RangeCalendarHeadCell>
            {/each}
          </RangeCalendarGridRow>
        </RangeCalendarGridHead>
        <RangeCalendarGridBody>
          {#each month.weeks as weekDates, weekIndex (`${month.value.toString()}-${weekIndex}`)}
            <RangeCalendarGridRow>
              {#each weekDates as date (date.toString())}
                <RangeCalendarCell {date} month={month.value}>
                  <RangeCalendarDay />
                </RangeCalendarCell>
              {/each}
            </RangeCalendarGridRow>
          {/each}
        </RangeCalendarGridBody>
      </RangeCalendarGrid>
    {/each}
  {/snippet}
</RangeCalendarPrimitive.Root>
