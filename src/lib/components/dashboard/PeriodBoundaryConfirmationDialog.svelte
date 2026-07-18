<script lang="ts">
  import { AlertDialog } from "bits-ui";
  import type { PeriodBoundaryUpdateProposal } from "$lib/dashboard/period-update-api";

  type Props = {
    proposal: PeriodBoundaryUpdateProposal | null;
    confirmSaving: boolean;
    confirm: () => void;
    cancel: () => void;
  };

  let { proposal, confirmSaving, confirm, cancel }: Props = $props();
  let cancelButton = $state<HTMLButtonElement | null>(null);

  function handleOpenChange(open: boolean): void {
    if (!open && !confirmSaving) cancel();
  }

  function handleOpenAutoFocus(event: Event): void {
    event.preventDefault();
    cancelButton?.focus();
  }

  function handleEscapeKeydown(event: KeyboardEvent): void {
    if (confirmSaving) event.preventDefault();
  }
</script>

<AlertDialog.Root open={proposal != null} onOpenChange={handleOpenChange}>
  {#if proposal}
    <AlertDialog.Portal>
      <AlertDialog.Overlay class="period-boundary-overlay" />
      <AlertDialog.Content
        class="period-boundary-content"
        onOpenAutoFocus={handleOpenAutoFocus}
        onEscapeKeydown={handleEscapeKeydown}
      >
        <AlertDialog.Title level={2}>
          予算期間の境界を変更しますか？
        </AlertDialog.Title>
        <AlertDialog.Description>
          この変更により、後続の予算期間の開始日も変更されます。内容を確認してください。
        </AlertDialog.Description>

        <dl>
          <div>
            <dt>変更する期間</dt>
            <dd>
              <span
                >{proposal.target.before.startDate} ～ {proposal.target.before
                  .endDate}</span
              >
              <span class="arrow" aria-hidden="true">→</span>
              <span
                >{proposal.target.after.startDate} ～ {proposal.target.after
                  .endDate}</span
              >
            </dd>
          </div>
          <div>
            <dt>後続期間</dt>
            <dd>
              <span
                >{proposal.successor.before.startDate} ～ {proposal.successor
                  .before.endDate}</span
              >
              <span class="arrow" aria-hidden="true">→</span>
              <span
                >{proposal.successor.after.startDate} ～ {proposal.successor
                  .after.endDate}</span
              >
            </dd>
          </div>
        </dl>

        <div class="period-boundary-actions">
          <AlertDialog.Cancel bind:ref={cancelButton} disabled={confirmSaving}>
            キャンセル
          </AlertDialog.Cancel>
          <AlertDialog.Action
            disabled={confirmSaving}
            aria-busy={confirmSaving}
            onclick={confirm}
          >
            {confirmSaving ? "変更中..." : "変更する"}
          </AlertDialog.Action>
        </div>
      </AlertDialog.Content>
    </AlertDialog.Portal>
  {/if}
</AlertDialog.Root>

<style>
  :global(.period-boundary-overlay) {
    background: rgba(47, 34, 25, 0.56);
    inset: 0;
    position: fixed;
    z-index: 50;
  }

  :global(.period-boundary-content) {
    background: #fffdf8;
    border: 1px solid #d8cdbf;
    border-radius: 14px;
    box-shadow: 0 24px 80px rgba(51, 38, 26, 0.24);
    box-sizing: border-box;
    color: #2f2219;
    display: grid;
    gap: 1rem;
    left: 50%;
    max-height: calc(100dvh - 2rem);
    max-width: min(36rem, calc(100vw - 2rem));
    overflow-y: auto;
    padding: 1.5rem;
    position: fixed;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 100%;
    z-index: 51;
  }

  :global(.period-boundary-content [data-dialog-title]) {
    font-size: clamp(1.25rem, 3vw, 1.55rem);
    font-weight: 900;
    line-height: 1.3;
    margin: 0;
  }

  :global(.period-boundary-content [data-dialog-description]) {
    color: #67584c;
    line-height: 1.7;
    margin: 0;
  }

  dl {
    display: grid;
    gap: 0.75rem;
    margin: 0;
  }

  dl > div {
    background: #f8f3e9;
    border: 1px solid #e4ddd2;
    border-radius: 10px;
    padding: 0.9rem 1rem;
  }

  dt {
    color: #397d3d;
    font-weight: 900;
    margin-bottom: 0.45rem;
  }

  dd {
    align-items: center;
    display: grid;
    font-variant-numeric: tabular-nums;
    gap: 0.35rem 0.65rem;
    grid-template-columns: 1fr auto 1fr;
    margin: 0;
  }

  dd span:not(.arrow) {
    white-space: nowrap;
  }

  .arrow {
    color: #78695d;
    font-weight: 900;
  }

  .period-boundary-actions {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
  }

  :global(.period-boundary-actions button) {
    border: 1px solid #2f6d3b;
    border-radius: 8px;
    cursor: pointer;
    font: inherit;
    font-weight: 800;
    min-height: 2.65rem;
    padding: 0 1rem;
  }

  :global(.period-boundary-actions [data-alert-dialog-cancel]) {
    background: #fffdf8;
    color: #2f6d3b;
  }

  :global(.period-boundary-actions [data-alert-dialog-action]) {
    background: #2f6d3b;
    color: #fff;
  }

  :global(.period-boundary-actions button:focus) {
    outline: 3px solid #e1a540;
    outline-offset: 3px;
  }

  :global(.period-boundary-actions button:disabled) {
    cursor: wait;
    opacity: 0.65;
  }

  @media (max-width: 520px) {
    :global(.period-boundary-content) {
      border-radius: 18px;
      max-height: calc(100dvh - 1.5rem);
      max-width: calc(100vw - 1.5rem);
      padding: 1.1rem;
    }

    dd {
      align-items: start;
      grid-template-columns: 1fr;
    }

    .arrow {
      transform: rotate(90deg);
      width: min-content;
    }

    .period-boundary-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
  }
</style>
