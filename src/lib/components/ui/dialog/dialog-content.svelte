<script lang="ts">
  import { Dialog as DialogPrimitive } from "bits-ui";
  import { cn } from "#lib/utils.ts";
  import { dialogSurface } from "./dialog-surface.ts";
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
      "z-[51] max-w-[min(44rem,calc(100vw-2rem))] px-(--panel-padding-inline) py-(--panel-padding-block) [@media(max-width:760px)]:bottom-0 [@media(max-width:760px)]:left-0 [@media(max-width:760px)]:top-auto [@media(max-width:760px)]:max-h-[calc(100dvh-env(safe-area-inset-top))] [@media(max-width:760px)]:max-w-none [@media(max-width:760px)]:translate-none [@media(max-width:760px)]:rounded-b-none [@media(max-width:760px)]:rounded-t-2xl [@media(max-width:760px)]:pt-(--panel-padding-mobile) [@media(max-width:760px)]:pr-[max(var(--panel-padding-mobile),env(safe-area-inset-right))] [@media(max-width:760px)]:pb-[max(var(--panel-padding-mobile),env(safe-area-inset-bottom))] [@media(max-width:760px)]:pl-[max(var(--panel-padding-mobile),env(safe-area-inset-left))]",
      className,
    )}
    {...restProps}
  >
    {@render children()}
  </DialogPrimitive.Content>
</DialogPortal>
