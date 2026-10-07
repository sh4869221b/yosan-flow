<script lang="ts">
  import { tick, type Snippet } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { Dialog } from "bits-ui";
  import "../dialog-surface.css";
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
    if (!event.defaultPrevented && !mobile.current) {
      event.preventDefault();
      void tick().then(focusTrigger);
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
      <Dialog.Trigger class="action-sheet-trigger" bind:ref={trigger}>
        {@render label()}
      </Dialog.Trigger>
    </div>
    {#if open}
      <Dialog.Portal>
        <Dialog.Overlay class="dashboard-dialog-overlay" />
        <Dialog.Content
          class="dashboard-dialog-content action-sheet-content"
          data-testid={sheetTestId}
          onOpenAutoFocus={focusHeading}
          onCloseAutoFocus={handleCloseAutoFocus}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <div class="sheet-header">
            <Dialog.Title level={2} tabindex={-1} bind:ref={heading}>
              {title}
            </Dialog.Title>
            <Dialog.Close class="action-sheet-close">閉じる</Dialog.Close>
          </div>
          <Dialog.Description class="action-sheet-description">
            {description}
          </Dialog.Description>
          <div data-testid={testId}>
            {@render children()}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    {/if}
  </Dialog.Root>
{:else}
  <details
    class="period-action-card"
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

<style>
  :global(.action-sheet-trigger) {
    background: #fffdf8;
    border: 1px solid #e4ddd2;
    border-radius: 12px;
    box-shadow: 0 18px 60px rgba(51, 38, 26, 0.07);
    padding: 1.15rem 1.25rem;
  }

  :global(.action-sheet-trigger) {
    align-items: center;
    display: flex;
    gap: 0.75rem;
    list-style: none;
    min-height: 3.8rem;
  }

  :global(.action-sheet-trigger svg) {
    color: #397d3d;
    flex: 0 0 auto;
  }

  :global(.action-sheet-trigger) {
    border-radius: 18px;
    box-sizing: border-box;
    color: #2f2219;
    cursor: pointer;
    font: inherit;
    font-weight: 800;
    min-height: 4.9rem;
    padding: 0.95rem;
    text-align: left;
    width: 100%;
  }

  .sheet-header {
    align-items: flex-start;
    display: flex;
    gap: 0.75rem;
    justify-content: space-between;
  }

  :global(.action-sheet-content [data-dialog-title]) {
    font-size: 1.2rem;
    line-height: 1.4;
    margin: 0;
  }

  :global(.action-sheet-description) {
    color: #67584c;
    line-height: 1.5;
    margin: 0;
  }

  :global(.action-sheet-close) {
    background: #f5f1e9;
    border: 1px solid #ded3c6;
    border-radius: 8px;
    color: #2f2219;
    cursor: pointer;
    flex: 0 0 auto;
    font: inherit;
    font-weight: 800;
    min-height: 2.65rem;
    padding: 0 0.75rem;
  }

  :global(.action-sheet-trigger:focus-visible),
  :global(.action-sheet-close:focus-visible) {
    outline: 3px solid #2f76c2;
    outline-offset: 3px;
  }
</style>
