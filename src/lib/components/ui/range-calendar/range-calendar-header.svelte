<script lang="ts">
  import { RangeCalendar as RangeCalendarPrimitive } from "bits-ui";
  import { cn } from "#lib/utils.ts";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: RangeCalendarPrimitive.HeaderProps = $props();
</script>

<RangeCalendarPrimitive.Header
  bind:ref
  class={cn(
    "grid w-full grid-cols-[auto_1fr_auto] items-center gap-3",
    className,
  )}
  {...restProps}
/>
