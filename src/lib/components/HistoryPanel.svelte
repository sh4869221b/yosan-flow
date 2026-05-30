<script lang="ts">
  import { Pencil, Save, Trash2, X } from "@lucide/svelte";

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
  }

  function cancelEdit(): void {
    editingHistoryId = null;
    editInputYen = "";
    editMemo = "";
    pendingSaveHistoryId = null;
  }

  function saveEdit(historyId: string): void {
    const parsed = Number.parseInt(editInputYen, 10);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return;
    }
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
  {#if histories.length === 0}
    <div class="empty-history">
      <p>履歴はまだありません。</p>
      <small>入力を保存すると履歴が表示されます。</small>
    </div>
  {:else}
    <ul>
      {#each histories as history (history.id)}
        <li class:editing={editingHistoryId === history.id}>
          <div class="history-row-header">
            <div class="history-meta">
              <strong
                >{history.operationType === "add" ? "追加" : "調整"}</strong
              >
              <time datetime={history.createdAt}>{history.createdAt}</time>
            </div>
            <div class="row-actions" aria-label="履歴操作">
              <button
                class="icon-button"
                type="button"
                onclick={() => startEdit(history)}
                disabled={historyMutatingId != null ||
                  (editingHistoryId != null && editingHistoryId !== history.id)}
              >
                <Pencil size={16} strokeWidth={2.4} aria-hidden="true" />
                編集
              </button>
              <button
                class="icon-button danger"
                type="button"
                onclick={() => removeHistory(history.id)}
                disabled={historyMutatingId != null || editingHistoryId != null}
              >
                <Trash2 size={16} strokeWidth={2.4} aria-hidden="true" />
                削除
              </button>
            </div>
          </div>
          {#if editingHistoryId === history.id}
            <form
              class="inline-edit"
              onsubmit={(event) => {
                event.preventDefault();
                saveEdit(history.id);
              }}
            >
              <label>
                入力額 (円)
                <input
                  type="number"
                  min="0"
                  inputmode="numeric"
                  bind:value={editInputYen}
                  disabled={historyMutatingId === history.id}
                />
              </label>
              <label>
                メモ
                <textarea
                  rows="2"
                  bind:value={editMemo}
                  disabled={historyMutatingId === history.id}
                ></textarea>
              </label>
              <div class="edit-actions">
                <button
                  class="save-button"
                  type="submit"
                  disabled={historyMutatingId === history.id}
                >
                  <Save size={16} strokeWidth={2.4} aria-hidden="true" />
                  保存
                </button>
                <button
                  class="cancel-button"
                  type="button"
                  onclick={cancelEdit}
                  disabled={historyMutatingId === history.id}
                >
                  <X size={16} strokeWidth={2.4} aria-hidden="true" />
                  キャンセル
                </button>
              </div>
            </form>
          {:else}
            <p>
              入力 {history.inputYen} 円 / 変更前 {history.beforeTotalYen} 円 / 変更後
              {history.afterTotalYen} 円
            </p>
            {#if history.memo}
              <small>{history.memo}</small>
            {/if}
          {/if}
        </li>
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
  small,
  time {
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

  li {
    background: #fffaf0;
    border: 1px solid #eadcc9;
    border-radius: 10px;
    display: grid;
    gap: 0.35rem;
    padding: 0.75rem;
  }

  .history-row-header {
    align-items: baseline;
    display: flex;
    gap: 0.75rem;
    justify-content: space-between;
  }

  .history-meta {
    align-items: baseline;
    display: flex;
    gap: 0.75rem;
    min-width: 0;
  }

  strong {
    color: #397d3d;
  }

  button,
  input,
  textarea {
    box-sizing: border-box;
    font: inherit;
    max-width: 100%;
  }

  .row-actions,
  .edit-actions {
    display: flex;
    gap: 0.45rem;
  }

  button {
    align-items: center;
    border-radius: 8px;
    cursor: pointer;
    display: inline-flex;
    font-weight: 900;
    gap: 0.35rem;
    justify-content: center;
    min-height: 2.45rem;
    padding: 0 0.75rem;
  }

  button:disabled {
    cursor: wait;
    opacity: 0.65;
  }

  .icon-button,
  .cancel-button {
    background: #fffdf8;
    border: 1px solid #d9cdbc;
    color: #2f2219;
  }

  .icon-button.danger {
    border-color: #efc3bd;
    color: #9b2c22;
  }

  .save-button {
    background: #2f6d3b;
    border: 1px solid #2f6d3b;
    color: #fff;
  }

  .inline-edit {
    display: grid;
    gap: 0.7rem;
  }

  .inline-edit label {
    display: grid;
    font-weight: 800;
    gap: 0.35rem;
  }

  input,
  textarea {
    background: #fff;
    border: 1px solid #ded3c6;
    border-radius: 8px;
    color: #2f2219;
    padding: 0.65rem 0.75rem;
    width: 100%;
  }

  textarea {
    resize: vertical;
  }

  li.editing {
    background: #f2fbf0;
    border-color: #b8d8af;
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

    .history-row-header,
    .history-meta,
    .row-actions,
    .edit-actions {
      align-items: stretch;
      display: grid;
      gap: 0.45rem;
    }

    button {
      min-height: 2.75rem;
      width: 100%;
    }

    .empty-history {
      min-height: 5.5rem;
      text-align: left;
    }
  }
</style>
