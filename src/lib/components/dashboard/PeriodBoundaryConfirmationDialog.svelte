<script lang="ts">
  import { AlertDialog } from "bits-ui";
  import type { PeriodBoundaryUpdateProposal } from "#lib/dashboard/period-update-api.ts";
  import "../dialog-surface.css";

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
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <AlertDialog.Title level={2}>
          予算期間の境界を変更しますか？
        </AlertDialog.Title>
        <AlertDialog.Description>
          関連する2つの予算期間の境界を変更します。変更前後を確認してください。
        </AlertDialog.Description>

        <p class="explanation">
          2つの期間を一括で更新します。キャンセルした場合は、どちらも保存されません。
        </p>
        <dl>
          {#each [{ label: "前の期間", value: proposal.previous }, { label: "後の期間", value: proposal.next }] as period (period.value.before.id)}
            <div>
              <dt>
                {period.label}{period.value.before.id ===
                proposal.editedPeriodId
                  ? "（編集中）"
                  : ""}
              </dt>
              <dd class="period-id">期間ID: {period.value.before.id}</dd>
              <dd class="ranges">
                <span
                  ><strong>変更前</strong>{period.value.before.startDate} ～ {period
                    .value.before.endDate}</span
                >
                <span class="arrow" aria-hidden="true">→</span>
                <span
                  ><strong>変更後</strong>{period.value.after.startDate} ～ {period
                    .value.after.endDate}</span
                >
              </dd>
            </div>
          {/each}
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
    background: var(--overlay);
    inset: 0;
    position: fixed;
    z-index: 60;
  }

  :global(.period-boundary-content) {
    max-width: min(36rem, calc(100vw - 2rem));
    padding: 1.5rem;
    z-index: 61;
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
    background: var(--muted);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 0.9rem 1rem;
  }

  dt {
    color: #397d3d;
    font-weight: 900;
    margin-bottom: 0.45rem;
  }

  .ranges {
    align-items: center;
    display: grid;
    font-variant-numeric: tabular-nums;
    gap: 0.35rem 0.65rem;
    grid-template-columns: 1fr auto 1fr;
    margin: 0;
  }

  .ranges strong {
    display: block;
    font-size: 0.875rem;
    color: #67584c;
  }
  .ranges span {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .period-id {
    margin: 0 0 0.65rem;
    overflow-wrap: anywhere;
    color: #67584c;
  }
  .explanation {
    margin: 0;
    line-height: 1.7;
    color: #67584c;
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
    border: 1px solid var(--primary);
    border-radius: var(--radius-md);
    cursor: pointer;
    font: inherit;
    font-weight: 800;
    min-height: var(--control-height);
    padding: 0 1rem;
  }

  :global(.period-boundary-actions [data-alert-dialog-cancel]) {
    background: var(--card);
    color: var(--primary);
  }

  :global(.period-boundary-actions [data-alert-dialog-action]) {
    background: var(--primary);
    color: var(--primary-foreground);
  }

  :global(.period-boundary-actions button:focus) {
    outline: 3px solid var(--focus-confirmation);
    outline-offset: 3px;
  }

  :global(.period-boundary-actions button:disabled) {
    cursor: wait;
    opacity: 0.65;
  }

  @media (max-width: 520px) {
    :global(.period-boundary-content) {
      border-radius: var(--radius-2xl);
      max-height: calc(100dvh - 1.5rem);
      max-width: calc(100vw - 1.5rem);
      padding: 1.1rem;
    }

    .ranges {
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
