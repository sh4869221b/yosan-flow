<script lang="ts">
  import { RangeCalendar as RangeCalendarPrimitive } from "bits-ui";
  import { cn } from "#lib/utils.ts";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: RangeCalendarPrimitive.DayProps = $props();
</script>

<RangeCalendarPrimitive.Day
  bind:ref
  class={cn(
    "flex min-h-(--cell-size) w-full items-center justify-center rounded-(--cell-radius) p-0 text-sm leading-none font-medium whitespace-nowrap select-none",
    "not-data-selected:hover:bg-accent/50 not-data-selected:hover:text-accent-foreground",
    "data-[range-middle]:rounded-none [&[data-today]:not([data-selected])]:bg-accent [&[data-today]:not([data-selected])]:text-accent-foreground",
    "data-[range-start]:bg-primary data-[range-start]:text-primary-foreground data-[range-end]:bg-primary data-[range-end]:text-primary-foreground",
    "[&[data-outside-month]:not([data-selected])]:text-muted-foreground",
    "data-[disabled]:pointer-events-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-65 data-[unavailable]:line-through",
    "focus-visible:relative focus-visible:outline-3 focus-visible:outline-[color:var(--focus-range)] focus-visible:-outline-offset-3",
    "data-[range-start]:focus-visible:outline-primary-foreground data-[range-end]:focus-visible:outline-primary-foreground",
    className,
  )}
  {...restProps}
/>
