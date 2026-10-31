<script lang="ts">
  import { AlertDialog as AlertDialogPrimitive } from "bits-ui";
  import { cn } from "#lib/utils.ts";
  import {
    dialogSheet,
    dialogSurface,
  } from "#lib/components/ui/dialog/dialog-surface.ts";
  import AlertDialogOverlay from "./alert-dialog-overlay.svelte";
  import AlertDialogPortal from "./alert-dialog-portal.svelte";
  import type { ComponentProps } from "svelte";

  let {
    ref = $bindable(null),
    class: className,
    overlayClass,
    portalProps,
    ...restProps
  }: Omit<AlertDialogPrimitive.ContentProps, "child"> & {
    portalProps?: Omit<
      ComponentProps<typeof AlertDialogPortal>,
      "child" | "children"
    >;
    overlayClass?: string;
  } = $props();
</script>

<AlertDialogPortal {...portalProps}>
  <AlertDialogOverlay class={overlayClass} />
  <AlertDialogPrimitive.Content
    bind:ref
    data-slot="alert-dialog-content"
    class={cn(
      dialogSurface,
      dialogSheet,
      "z-[61] max-w-[min(36rem,calc(100vw-2rem))]",
      className,
    )}
    {...restProps}
  />
</AlertDialogPortal>
