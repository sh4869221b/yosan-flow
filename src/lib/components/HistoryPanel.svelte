<script lang="ts">
  import HistoryRow from "./day-entry/HistoryRow.svelte";
  import { parseNonNegativeIntegerYenInput } from "$lib/dashboard/yen-input";

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

  type Props = {
    date?: string | null;
    isOpen?: boolean;
    histories?: HistoryItem[];
    loading?: boolean;
    errorMessage?: string | null;
    historyMutatingId?: string | null;
    updateHistory?: (_payload: {
      historyId: string;
      inputYen: number;
      memo: string;
    }) => void;
    deleteHistory?: (_payload: { historyId: string }) => void;
  };

  let {
    date = null,
    isOpen = false,
    histories = [],
    loading = false,
    errorMessage = null,
    historyMutatingId = null,
    updateHistory = () => {},
    deleteHistory = () => {},
  }: Props = $props();

  let editingHistoryId = $state<string | null>(null);
  let editInputYen = $state("");
  let editMemo = $state("");
  let pendingSaveHistoryId = $state<string | null>(null);
  let inputError = $state<string | null>(null);

  $effect(() => {
    if (
      pendingSaveHistoryId != null &&
      historyMutatingId === null &&
      errorMessage == null
    ) {
      cancelEdit();
    }
  });

  $effect(() => {
    if (!isOpen) {
      cancelEdit();
    }
  });

  function startEdit(history: HistoryItem): void {
    if (editingHistoryId != null && editingHistoryId !== history.id) {
      return;
    }
    editingHistoryId = history.id;
    editInputYen = String(history.inputYen);
    editMemo = history.memo ?? "";
    inputError = null;
  }

  function cancelEdit(): void {
    editingHistoryId = null;
    editInputYen = "";
    editMemo = "";
    pendingSaveHistoryId = null;
    inputError = null;
  }

  function saveEdit(historyId: string): void {
    const parsed = parseNonNegativeIntegerYenInput(editInputYen);
    if (parsed == null) {
      inputError = "入力額は 0 以上の整数で入力してください。";
      return;
    }
    inputError = null;
    updateHistory({
      historyId,
      inputYen: parsed,
      memo: editMemo,
    });
    pendingSaveHistoryId = historyId;
  }

  function removeHistory(historyId: string): void {
    if (editingHistoryId === historyId) {
      cancelEdit();
    }
    deleteHistory({ historyId });
  }
</script>

<section class="history-panel">
  <div class="history-heading">
    <h2>履歴表示</h2>
    {#if date}
      <p>対象日: {date}</p>
    {/if}
  </div>
  {#if loading}
    <p class="status">履歴を読み込み中...</p>
  {/if}
  {#if errorMessage}
    <p class="error-message" role="alert">{errorMessage}</p>
  {/if}
  {#if inputError}
    <p class="error-message" role="alert">{inputError}</p>
  {/if}
  {#if histories.length === 0}
    <div class="empty-history">
      <p>履歴はまだありません。</p>
      <small>入力を保存すると履歴が表示されます。</small>
    </div>
  {:else}
    <ul>
      {#each histories as history (history.id)}
        <HistoryRow
          {history}
          isEditing={editingHistoryId === history.id}
          isMutating={historyMutatingId === history.id}
          canStartEdit={historyMutatingId == null &&
            (editingHistoryId == null || editingHistoryId === history.id)}
          canDelete={historyMutatingId == null && editingHistoryId == null}
          bind:editInputYen
          bind:editMemo
          onStartEdit={startEdit}
          onCancelEdit={cancelEdit}
          onSaveEdit={saveEdit}
          onDelete={removeHistory}
        />
      {/each}
    </ul>
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
