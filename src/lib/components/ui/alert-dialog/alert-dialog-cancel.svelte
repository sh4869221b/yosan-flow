<script lang="ts">
  import { AlertDialog as AlertDialogPrimitive } from "bits-ui";
  import {
    buttonVariants,
    type ButtonVariant,
    type ButtonSize,
  } from "#lib/components/ui/button/button.svelte";
  import { cn } from "#lib/utils.ts";

  let {
    ref = $bindable(null),
    type = "button",
    class: className,
    variant = "outline",
    size = "default",
    ...restProps
  }: AlertDialogPrimitive.CancelProps & {
    variant?: ButtonVariant;
    size?: ButtonSize;
  } = $props();
</script>

<AlertDialogPrimitive.Cancel
  bind:ref
  {type}
  data-slot="alert-dialog-cancel"
  class={cn(buttonVariants({ variant, size }), className)}
  {...restProps}
/>
