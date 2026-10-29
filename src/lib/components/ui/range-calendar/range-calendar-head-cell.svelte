<script lang="ts">
  import { RangeCalendar as RangeCalendarPrimitive } from "bits-ui";
  import { cn } from "#lib/utils.ts";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: RangeCalendarPrimitive.HeadCellProps = $props();
</script>

<RangeCalendarPrimitive.HeadCell
  bind:ref
  class={cn(
    "w-[14.285%] py-2 text-center text-sm font-medium text-muted-foreground",
    className,
  )}
  {...restProps}
/>
