<script lang="ts">
  import { ClipboardList } from "@lucide/svelte";
  import { Dialog } from "bits-ui";
  import "./day-entry-modal.css";
  import DayEntryPreview from "$lib/components/day-entry/DayEntryPreview.svelte";
  import DayEntryForm from "$lib/components/day-entry/DayEntryForm.svelte";
  import HistoryPanel from "$lib/components/HistoryPanel.svelte";
  import type { DayEntryCloseReason } from "$lib/dashboard/controller-types";

  type HistoryItem = {
    id: string;
    date: string;
    operationType: "add" | "overwrite";
    inputYen: number;
    beforeTotalYen: number;
    afterTotalYen: number;
    memo: string | null;
    createdAt: string;
  };

  type SavePayload = {
    date: string;
    inputYen: number;
    memo: string;
  };

  type UpdateHistoryPayload = {
    historyId: string;
    inputYen: number;
    memo: string;
  };

  type Props = {
    isOpen?: boolean;
    date?: string | null;
    currentUsedYen?: number;
    isPlanned?: boolean;
    saving?: boolean;
    errorMessage?: string | null;
    historyErrorMessage?: string | null;
    historyLoading?: boolean;
    historyMutatingId?: string | null;
    histories?: HistoryItem[];
    inputYen?: string;
    memo?: string;
    previewAfterYen?: number;
    previewRemainingYen?: number | null;
    previewRecommendedYen?: number | null;
    close?: (_reason: DayEntryCloseReason) => void;
    onCloseAutoFocus?: (_event: Event) => void;
    save?: (_payload: SavePayload) => void;
    updateHistory?: (_payload: UpdateHistoryPayload) => void;
    deleteHistory?: (_payload: { historyId: string }) => void;
  };

  let {
    isOpen = false,
    date = null,
    currentUsedYen = 0,
    isPlanned = false,
    saving = false,
    errorMessage = null,
    historyErrorMessage = null,
    historyLoading = false,
    historyMutatingId = null,
    histories = [],
    inputYen = $bindable(""),
    memo = $bindable(""),
    previewAfterYen = 0,
    previewRemainingYen = null,
    previewRecommendedYen = null,
    close = () => {},
    onCloseAutoFocus = () => {},
    save = () => {},
    updateHistory = () => {},
    deleteHistory = () => {},
  }: Props = $props();

  let dialogTitle = $state<HTMLElement | null>(null);

  function handleOpenChange(open: boolean): void {
    if (!open && !saving) {
      close("cancel");
    }
  }

  function handleOpenAutoFocus(event: Event): void {
    event.preventDefault();
    dialogTitle?.focus();
  }

  function handleCloseAutoFocus(event: Event): void {
    onCloseAutoFocus(event);
  }

  function handleEscapeKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || !saving) {
      return;
    }
    event.preventDefault();
  }

  function preventOutsideDismissal(event: PointerEvent): void {
    event.preventDefault();
  }

  function cancel(): void {
    if (!saving) {
      close("cancel");
    }
  }
</script>

<Dialog.Root open={isOpen} onOpenChange={handleOpenChange}>
  {#if isOpen}
    <Dialog.Portal>
      <Dialog.Overlay class="day-entry-overlay" />
      <Dialog.Content
        class="day-entry-content"
        data-testid="day-entry-modal"
        onOpenAutoFocus={handleOpenAutoFocus}
        onCloseAutoFocus={handleCloseAutoFocus}
        onEscapeKeydown={handleEscapeKeydown}
        onInteractOutside={preventOutsideDismissal}
      >
        <div class="entry-header">
          <span class="entry-icon" aria-hidden="true">
            <ClipboardList size={24} strokeWidth={2.4} />
          </span>
          <div>
            <p class="eyebrow">Step 2</p>
            <Dialog.Title level={2} tabindex={-1} bind:ref={dialogTitle}>
              日次入力
              {#if date}
                <span class="target-date">対象日: {date}</span>
              {/if}
            </Dialog.Title>
          </div>
        </div>
        <Dialog.Description>
          入力額とメモを入力して保存します。
        </Dialog.Description>

        {#if isPlanned}
          <p class="planned-note">予定支出として登録されます。</p>
        {/if}

        {#if saving}
          <p class="saving-status" role="status">
            保存中です。処理が完了するまで閉じられません。
          </p>
        {/if}

        {#key date}
          <DayEntryForm
            bind:inputYen
            bind:memo
            {saving}
            close={cancel}
            {save}
            {date}
            saveError={errorMessage}
          >
            {#snippet preview()}
              <DayEntryPreview
                {currentUsedYen}
                {previewAfterYen}
                {previewRemainingYen}
                {previewRecommendedYen}
              />
            {/snippet}
          </DayEntryForm>
        {/key}

        <section
          class="history-region"
          aria-labelledby="day-entry-history-heading"
        >
          <HistoryPanel
            {isOpen}
            {date}
            {histories}
            loading={historyLoading}
            errorMessage={historyErrorMessage}
            {historyMutatingId}
            {updateHistory}
            {deleteHistory}
            headingId="day-entry-history-heading"
          />
        </section>
      </Dialog.Content>
    </Dialog.Portal>
  {/if}
</Dialog.Root>
