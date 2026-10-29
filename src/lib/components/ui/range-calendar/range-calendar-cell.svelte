<script lang="ts">
  import { RangeCalendar as RangeCalendarPrimitive } from "bits-ui";
  import { cn } from "#lib/utils.ts";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: RangeCalendarPrimitive.CellProps = $props();
</script>

<RangeCalendarPrimitive.Cell
  bind:ref
  class={cn(
    "relative w-[14.285%] p-0 text-center text-sm focus-within:z-20 [&:has([data-range-middle])]:bg-accent [&:has([data-range-start])]:rounded-s-(--cell-radius) [&:has([data-range-end])]:rounded-e-(--cell-radius) [&:has([data-selected])]:bg-accent",
    className,
  )}
  {...restProps}
/>
