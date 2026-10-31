<script lang="ts">
  import * as AlertDialog from "#lib/components/ui/alert-dialog/index.ts";
  import type { PeriodBoundaryUpdateProposal } from "#lib/dashboard/period-update-api.ts";

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
    <AlertDialog.Content
      onOpenAutoFocus={handleOpenAutoFocus}
      onEscapeKeydown={handleEscapeKeydown}
      onCloseAutoFocus={(event) => event.preventDefault()}
    >
      <AlertDialog.Title
        level={2}
        class="text-[clamp(1.25rem,3vw,1.55rem)] font-black"
      >
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
              {period.label}{period.value.before.id === proposal.editedPeriodId
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
        <AlertDialog.Cancel
          type="button"
          bind:ref={cancelButton}
          disabled={confirmSaving}
        >
          キャンセル
        </AlertDialog.Cancel>
        <AlertDialog.Action
          type="button"
          disabled={confirmSaving}
          aria-busy={confirmSaving}
          onclick={confirm}
        >
          {confirmSaving ? "変更中..." : "変更する"}
        </AlertDialog.Action>
      </div>
    </AlertDialog.Content>
  {/if}
</AlertDialog.Root>

<style>
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
    color: var(--icon-foreground);
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
    color: var(--muted-foreground);
  }
  .ranges span {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .period-id {
    margin: 0 0 0.65rem;
    overflow-wrap: anywhere;
    color: var(--muted-foreground);
  }
  .explanation {
    margin: 0;
    line-height: 1.7;
    color: var(--muted-foreground);
  }

  .arrow {
    color: var(--muted-foreground);
    font-weight: 900;
  }

  .period-boundary-actions {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
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
