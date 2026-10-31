<script lang="ts">
  import { tick, type Snippet } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import * as Dialog from "#lib/components/ui/dialog/index.ts";
  import { buttonVariants } from "#lib/components/ui/button/button.svelte";
  import { cn } from "#lib/utils.ts";
  import "./period-action-card.css";

  type Props = {
    title: string;
    description: string;
    open?: boolean;
    testId?: string;
    sheetTestId: string;
    icon?: Snippet;
    children: Snippet;
    onClose?: () => void;
    onCloseAutoFocus?: (_event: Event) => void;
  };

  let {
    title,
    description,
    open = $bindable(false),
    testId,
    sheetTestId,
    icon,
    children,
    onClose = () => {},
    onCloseAutoFocus = () => {},
  }: Props = $props();

  const mobile = new MediaQuery("(max-width: 760px)");
  let trigger = $state<HTMLElement | null>(null);
  let heading = $state<HTMLElement | null>(null);

  export function isMobile(): boolean {
    return mobile.current;
  }

  export function focusTrigger(): void {
    trigger?.focus();
  }

  function handleOpenChange(value: boolean): void {
    open = value;
    if (!value) onClose();
  }

  function focusHeading(event: Event): void {
    event.preventDefault();
    heading?.focus();
  }

  function handleCloseAutoFocus(event: Event): void {
    onCloseAutoFocus(event);
    if (!event.defaultPrevented) {
      event.preventDefault();
      void tick().then(() => {
        // Resizing can remove the element the dialog would otherwise restore.
        if (!mobile.current || !open) focusTrigger();
      });
    }
  }
</script>

{#snippet label()}
  {#if icon}{@render icon()}{/if}
  {title}
{/snippet}

{#if mobile.current}
  <Dialog.Root bind:open onOpenChange={handleOpenChange}>
    <div data-testid={open ? undefined : testId}>
      <Dialog.Trigger
        type="button"
        class="flex min-h-[4.9rem] w-full items-center gap-3 rounded-2xl border border-border bg-card p-(--panel-padding-mobile) text-left font-extrabold text-card-foreground shadow-card outline-offset-[3px] [&_svg]:shrink-0 [&_svg]:text-icon-foreground"
        bind:ref={trigger}
      >
        {@render label()}
      </Dialog.Trigger>
    </div>
    {#if open}
      <Dialog.Content
        data-testid={sheetTestId}
        onOpenAutoFocus={focusHeading}
        onCloseAutoFocus={handleCloseAutoFocus}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <div class="flex items-start justify-between gap-3">
          <Dialog.Title level={2} tabindex={-1} bind:ref={heading}>
            {title}
          </Dialog.Title>
          <Dialog.Close
            type="button"
            class={cn(
              buttonVariants({ variant: "secondary" }),
              "shrink-0 px-3 font-extrabold",
            )}>閉じる</Dialog.Close
          >
        </div>
        <Dialog.Description>
          {description}
        </Dialog.Description>
        <div data-testid={testId}>
          {@render children()}
        </div>
      </Dialog.Content>
    {/if}
  </Dialog.Root>
{:else}
  <details
    class="period-action-card rounded-panel border border-border bg-card px-(--panel-padding-inline) py-(--panel-padding-block) shadow-card"
    bind:open
    data-testid={testId}
    ontoggle={() => {
      if (!open) onClose();
    }}
  >
    <summary bind:this={trigger}>
      {@render label()}
    </summary>
    <div class="details-body">
      {@render children()}
    </div>
  </details>
{/if}
