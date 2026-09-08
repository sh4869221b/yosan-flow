<script lang="ts">
  import { tick } from "svelte";
  import HistoryRow from "./day-entry/HistoryRow.svelte";
  import type { HistoryActionResult, HistoryItem } from "$lib/dashboard/types";

  type Props = {
    date?: string | null;
    headingId?: string;
    isOpen?: boolean;
    histories?: HistoryItem[];
    loading?: boolean;
    errorMessage?: string | null;
    historyMutatingId?: string | null;
    retryHistory?: (_date: string) => Promise<HistoryActionResult>;
    updateHistory?: (_payload: {
      historyId: string;
      inputYen: number;
      memo: string;
    }) => Promise<HistoryActionResult>;
    deleteHistory?: (_payload: {
      historyId: string;
    }) => Promise<HistoryActionResult>;
  };

  type RetryOperation = { readonly date: string };
  type EditOperation = { readonly date: string; readonly historyId: string };
  type DeleteOperation = {
    readonly date: string;
    readonly historyId: string;
    readonly nextHistoryId: string | null;
    readonly previousHistoryId: string | null;
  };

  let {
    date = null,
    headingId = undefined,
    isOpen = false,
    histories = [],
    loading = false,
    errorMessage = null,
    historyMutatingId = null,
    retryHistory = async () => ({ kind: "ignored" }),
    updateHistory = async () => ({ kind: "ignored" }),
    deleteHistory = async () => ({ kind: "ignored" }),
  }: Props = $props();

  let editingHistoryId = $state<string | null>(null);
  let editInputYen = $state("");
  let editMemo = $state("");
  let pendingSaveHistoryId = $state<string | null>(null);
  let editFailureHistoryId = $state<string | null>(null);
  let confirmingDeleteHistoryId = $state<string | null>(null);
  let pendingDeleteHistoryId = $state<string | null>(null);
  let deleteFailureHistoryId = $state<string | null>(null);
  let deleteFailureMessage = $state<string | null>(null);
  let deleteSuccessMessage = $state<string | null>(null);
  let saveSuccessHistoryId = $state<string | null>(null);
  let activeRetry = $state.raw<RetryOperation | null>(null);
  let activeEdit = $state.raw<EditOperation | null>(null);
  let activeDelete = $state.raw<DeleteOperation | null>(null);
  let historyHeading = $state<HTMLHeadingElement | null>(null);

  $effect(() => {
    if (!isOpen) {
      cancelEdit();
      resetDelete();
      activeRetry = null;
    }
    return () => {
      activeEdit = null;
      activeDelete = null;
      activeRetry = null;
    };
  });

  $effect(() => {
    void date;
    cancelEdit();
    resetDelete();
    activeRetry = null;
  });

  function clearDeleteSuccess(): void {
    deleteSuccessMessage = null;
    saveSuccessHistoryId = null;
  }

  function startEdit(history: HistoryItem): void {
    if (editingHistoryId != null && editingHistoryId !== history.id) {
      return;
    }
    activeEdit = null;
    activeDelete = null;
    confirmingDeleteHistoryId = null;
    deleteFailureHistoryId = null;
    deleteFailureMessage = null;
    clearDeleteSuccess();
    editFailureHistoryId = null;
    editingHistoryId = history.id;
    editInputYen = String(history.inputYen);
    editMemo = history.memo ?? "";
  }

  function cancelEdit(): void {
    editingHistoryId = null;
    editInputYen = "";
    editMemo = "";
    pendingSaveHistoryId = null;
    activeEdit = null;
    editFailureHistoryId = null;
    clearDeleteSuccess();
  }

  function resetDelete(): void {
    confirmingDeleteHistoryId = null;
    pendingDeleteHistoryId = null;
    deleteFailureHistoryId = null;
    deleteFailureMessage = null;
    deleteSuccessMessage = null;
    activeDelete = null;
  }

  function startDelete(history: HistoryItem): void {
    if (historyMutatingId != null || pendingDeleteHistoryId != null) {
      return;
    }
    activeDelete = null;
    confirmingDeleteHistoryId = history.id;
    deleteFailureHistoryId = null;
    deleteFailureMessage = null;
    clearDeleteSuccess();
  }

  function cancelDelete(): void {
    if (pendingDeleteHistoryId != null) {
      return;
    }
    confirmingDeleteHistoryId = null;
    deleteFailureHistoryId = null;
    deleteFailureMessage = null;
    clearDeleteSuccess();
  }

  async function saveEdit(historyId: string): Promise<HistoryActionResult> {
    if (!isOpen || date == null) return { kind: "ignored" };
    editFailureHistoryId = null;
    const operation: EditOperation = { date, historyId };
    activeEdit = operation;
    pendingSaveHistoryId = historyId;
    editingHistoryId = null;
    const result = await updateHistory({
      historyId,
      inputYen: Number(editInputYen.trim()),
      memo: editMemo,
    });
    if (activeEdit !== operation || !isOpen || date !== operation.date) {
      if (pendingSaveHistoryId === historyId) {
        pendingSaveHistoryId = null;
      }
      return { kind: "ignored" };
    }
    activeEdit = null;
    pendingSaveHistoryId = null;
    if (result.kind === "failure") {
      editFailureHistoryId = historyId;
      editingHistoryId = historyId;
    } else if (result.kind === "success") {
      saveSuccessHistoryId = historyId;
    }
    return result;
  }

  async function restoreDeletedFocus(
    operation: DeleteOperation,
  ): Promise<void> {
    await tick();
    if (activeDelete !== operation || !isOpen || date !== operation.date) {
      return;
    }
    const editButtons = [
      ...(historyHeading
        ?.closest(".history-panel")
        ?.querySelectorAll<HTMLButtonElement>("[data-history-edit-id]") ?? []),
    ];
    const findEditButton = (
      historyId: string | null,
    ): HTMLButtonElement | null =>
      editButtons.find(
        (button) => button.dataset.historyEditId === historyId,
      ) ?? null;
    const focusTarget =
      findEditButton(operation.nextHistoryId) ??
      findEditButton(operation.previousHistoryId) ??
      historyHeading;
    focusTarget?.focus();
  }

  async function removeHistory(
    historyId: string,
  ): Promise<HistoryActionResult> {
    if (!isOpen || date == null) {
      return { kind: "ignored" };
    }
    const historyIndex = histories.findIndex(
      (history) => history.id === historyId,
    );
    if (historyIndex === -1) {
      return { kind: "ignored" };
    }
    const operation: DeleteOperation = {
      date,
      historyId,
      nextHistoryId: histories[historyIndex + 1]?.id ?? null,
      previousHistoryId: histories[historyIndex - 1]?.id ?? null,
    };
    activeDelete = operation;
    pendingDeleteHistoryId = historyId;
    deleteFailureHistoryId = null;
    deleteFailureMessage = null;
    const result = await deleteHistory({ historyId });
    if (activeDelete !== operation || !isOpen || date !== operation.date) {
      if (pendingDeleteHistoryId === historyId) {
        pendingDeleteHistoryId = null;
      }
      return { kind: "ignored" };
    }
    pendingDeleteHistoryId = null;
    await tick();
    if (result.kind === "failure") {
      if (histories.some((history) => history.id === historyId)) {
        deleteFailureHistoryId = historyId;
        deleteFailureMessage = result.message;
      } else {
        await restoreDeletedFocus(operation);
      }
    } else if (result.kind === "success") {
      confirmingDeleteHistoryId = null;
      deleteSuccessMessage = "履歴を削除しました。";
      if (!histories.some((history) => history.id === historyId)) {
        await restoreDeletedFocus(operation);
      }
    }
    if (activeDelete === operation) {
      activeDelete = null;
    }
    return result;
  }

  async function retry(): Promise<void> {
    if (date == null || loading || activeRetry != null) return;
    const operation: RetryOperation = { date };
    activeRetry = operation;
    const result = await retryHistory(date);
    if (activeRetry !== operation || !isOpen || date !== operation.date) return;
    activeRetry = null;
    if (result.kind === "success") {
      await tick();
      historyHeading?.focus();
    }
  }
</script>

<section class="history-panel">
  <div class="history-heading">
    <h2 id={headingId} tabindex="-1" bind:this={historyHeading}>履歴表示</h2>
    {#if date}
      <p>対象日: {date}</p>
    {/if}
  </div>
  {#if deleteSuccessMessage}
    <p class="status" role="status">{deleteSuccessMessage}</p>
  {/if}
  {#if loading}
    <p class="status" role="status">履歴を読み込み中...</p>
  {:else if errorMessage && editFailureHistoryId == null && deleteFailureHistoryId == null}
    <p class="error-message" role="alert">{errorMessage}</p>
  {:else if histories.length === 0}
    <div class="empty-history">
      <p>履歴はまだありません。</p>
      <small>入力を保存すると履歴が表示されます。</small>
    </div>
  {/if}
  {#if histories.length > 0}
    <ul>
      {#each histories as history (history.id)}
        <HistoryRow
          {history}
          isEditing={editingHistoryId === history.id}
          isMutating={historyMutatingId === history.id}
          isSaving={pendingSaveHistoryId === history.id}
          mutationUnavailable={historyMutatingId != null &&
            historyMutatingId !== history.id}
          canStartEdit={editingHistoryId == null &&
            pendingSaveHistoryId !== history.id}
          canDelete={historyMutatingId == null &&
            pendingSaveHistoryId == null &&
            editingHistoryId == null &&
            confirmingDeleteHistoryId == null}
          isDeleteConfirming={confirmingDeleteHistoryId === history.id}
          isDeleting={pendingDeleteHistoryId === history.id}
          isSaveSuccessful={saveSuccessHistoryId === history.id}
          deleteError={deleteFailureHistoryId === history.id
            ? deleteFailureMessage
            : null}
          bind:editInputYen
          bind:editMemo
          onStartEdit={startEdit}
          onCancelEdit={cancelEdit}
          onStartDelete={startDelete}
          onCancelDelete={cancelDelete}
          onSaveEdit={saveEdit}
          onDelete={removeHistory}
        />
      {/each}
    </ul>
  {/if}
  {#if (errorMessage && editFailureHistoryId == null && deleteFailureHistoryId == null) || activeRetry != null}
    <button
      class="retry-button"
      type="button"
      aria-disabled={loading || activeRetry != null}
      onclick={retry}
    >
      {activeRetry != null ? "再試行中..." : "履歴を再試行"}
    </button>
  {/if}
</section>

<style>
  .history-panel {
    border: 1px solid #e7ddd0;
    border-radius: 10px;
    display: grid;
    gap: 0.9rem;
    padding: 1rem;
  }

  .history-heading {
    align-items: baseline;
    display: flex;
    gap: 0.75rem;
    justify-content: space-between;
  }

  h2 {
    color: #2f2219;
    font-size: 1rem;
    letter-spacing: 0;
    margin: 0;
  }

  p {
    margin: 0;
  }

  .history-heading p,
  .status,
  small {
    color: #76675b;
    font-size: 0.84rem;
  }

  .empty-history {
    align-content: center;
    background: #fffaf0;
    border: 1px dashed #dcccb7;
    border-radius: 10px;
    display: grid;
    gap: 0.35rem;
    min-height: 13rem;
    padding: 1rem;
    text-align: center;
  }

  .empty-history p {
    color: #2f2219;
    font-weight: 900;
  }

  .error-message {
    background: #fff1f0;
    border: 1px solid #efc3bd;
    border-radius: 10px;
    color: #9b2c22;
    font-weight: 800;
    padding: 0.75rem 0.85rem;
  }

  .retry-button {
    background: #fffdf8;
    border: 1px solid #d9cdbc;
    border-radius: 8px;
    color: #2f2219;
    cursor: pointer;
    font: inherit;
    font-weight: 900;
    justify-self: start;
    min-height: 2.75rem;
    padding: 0 0.9rem;
  }

  .retry-button[aria-disabled="true"] {
    cursor: wait;
    opacity: 0.65;
  }

  ul {
    display: grid;
    gap: 0.65rem;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  @media (max-width: 760px) {
    .history-panel {
      padding: 0.8rem;
    }

    .history-heading {
      align-items: flex-start;
      display: grid;
      gap: 0.25rem;
    }

    .empty-history {
      min-height: 5.5rem;
      text-align: left;
    }
  }
</style>
