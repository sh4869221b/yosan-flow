<script lang="ts">
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import { cn, type WithElementRef } from "#lib/utils.ts";
  import type { HTMLSelectAttributes } from "svelte/elements";

  type NativeSelectProps = Omit<
    WithElementRef<HTMLSelectAttributes, HTMLSelectElement>,
    "size"
  > & {
    size?: "sm" | "default";
  };

  let {
    ref = $bindable(null),
    value = $bindable(),
    class: className,
    size = "default",
    children,
    ...restProps
  }: NativeSelectProps = $props();
</script>

<div
  class={cn("group/native-select relative w-fit", className)}
  data-slot="native-select-wrapper"
  data-size={size}
>
  <select
    bind:value
    bind:this={ref}
    data-slot="native-select"
    data-size={size}
    class="border-input placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 aria-invalid:border-destructive h-control w-full min-w-0 appearance-none rounded-md border bg-input-background py-1 pr-8 pl-2.5 text-sm shadow-xs transition-[color,box-shadow] select-none focus-visible:ring-3 aria-invalid:ring-3 data-[size=sm]:h-8 outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-65"
    {...restProps}
  >
    {@render children?.()}
  </select>
  <ChevronDownIcon
    class="text-muted-foreground top-1/2 right-2.5 size-4 -translate-y-1/2 pointer-events-none absolute select-none"
    aria-hidden
    data-slot="native-select-icon"
  />
</div>
