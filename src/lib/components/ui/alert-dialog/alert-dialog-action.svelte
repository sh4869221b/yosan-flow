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
    variant = "default",
    size = "default",
    ...restProps
  }: AlertDialogPrimitive.ActionProps & {
    variant?: ButtonVariant;
    size?: ButtonSize;
  } = $props();
</script>

<AlertDialogPrimitive.Action
  bind:ref
  {type}
  data-slot="alert-dialog-action"
  class={cn(buttonVariants({ variant, size }), className)}
  {...restProps}
/>
