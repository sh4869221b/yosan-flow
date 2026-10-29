<script lang="ts">
  import { AlertDialog as AlertDialogPrimitive } from "bits-ui";
  import { cn } from "#lib/utils.ts";
  import { dialogSurface } from "#lib/components/ui/dialog/dialog-surface.ts";
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
      "z-[61] max-w-[min(36rem,calc(100vw-2rem))] p-6 [@media(max-width:520px)]:max-h-[calc(100dvh-1.5rem)] [@media(max-width:520px)]:max-w-[calc(100vw-1.5rem)] [@media(max-width:520px)]:rounded-2xl [@media(max-width:520px)]:p-[1.1rem]",
      className,
    )}
    {...restProps}
  />
</AlertDialogPortal>
