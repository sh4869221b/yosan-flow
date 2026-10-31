<script lang="ts">
  import { Dialog as DialogPrimitive } from "bits-ui";
  import { cn } from "#lib/utils.ts";
  import { dialogSheet, dialogSurface } from "./dialog-surface.ts";
  import DialogOverlay from "./dialog-overlay.svelte";
  import DialogPortal from "./dialog-portal.svelte";
  import type { Snippet, ComponentProps } from "svelte";

  let {
    ref = $bindable(null),
    class: className,
    overlayClass,
    portalProps,
    children,
    ...restProps
  }: Omit<DialogPrimitive.ContentProps, "child" | "children"> & {
    portalProps?: Omit<
      ComponentProps<typeof DialogPortal>,
      "child" | "children"
    >;
    overlayClass?: string;
    children: Snippet;
  } = $props();
</script>

<DialogPortal {...portalProps}>
  <DialogOverlay class={overlayClass} />
  <DialogPrimitive.Content
    bind:ref
    data-slot="dialog-content"
    class={cn(
      dialogSurface,
      dialogSheet,
      "z-[51] max-w-[min(44rem,calc(100vw-2rem))]",
      className,
    )}
    {...restProps}
  >
    {@render children()}
  </DialogPrimitive.Content>
</DialogPortal>
