<script lang="ts">
  import { RangeCalendar as RangeCalendarPrimitive } from "bits-ui";
  import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import {
    buttonVariants,
    type ButtonVariant,
  } from "#lib/components/ui/button/button.svelte";
  import { cn } from "#lib/utils.ts";

  let {
    ref = $bindable(null),
    direction,
    class: className,
    "aria-label": ariaLabel,
    children,
    variant = "secondary",
    ...restProps
  }: Omit<
    | RangeCalendarPrimitive.PrevButtonProps
    | RangeCalendarPrimitive.NextButtonProps,
    "child"
  > & {
    direction: "previous" | "next";
    "aria-label": string;
    variant?: ButtonVariant;
  } = $props();

  const NavigationButton = $derived(
    direction === "previous"
      ? RangeCalendarPrimitive.PrevButton
      : RangeCalendarPrimitive.NextButton,
  );
  const Icon = $derived(
    direction === "previous" ? ChevronLeftIcon : ChevronRightIcon,
  );
</script>

<NavigationButton
  bind:ref
  class={cn(
    buttonVariants({ variant }),
    "size-(--cell-size) min-h-(--cell-size) p-0 select-none focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-[color:var(--focus-range)] focus-visible:-outline-offset-3 rtl:rotate-180",
    className,
  )}
  {...restProps}
>
  {#snippet child({ props })}
    <button {...props} type="button" aria-label={ariaLabel}>
      {#if children}
        {@render children()}
      {:else}
        <Icon class="size-4" aria-hidden="true" />
      {/if}
    </button>
  {/snippet}
</NavigationButton>
