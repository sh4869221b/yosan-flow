<script lang="ts">
  import { Dialog as DialogPrimitive } from "bits-ui";
  import { cn } from "#lib/utils.ts";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: DialogPrimitive.OverlayProps = $props();
</script>

<DialogPrimitive.Overlay
  bind:ref
  data-slot="dialog-overlay"
  class={cn("fixed inset-0 bg-overlay z-[50]", className)}
  {...restProps}
/>
