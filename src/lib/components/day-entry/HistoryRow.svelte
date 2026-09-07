<script lang="ts">
  import { Pencil, Save, Trash2, X } from "@lucide/svelte";
  import type { HistoryActionResult, HistoryItem } from "$lib/dashboard/types";

  type Props = {
    history: HistoryItem;
    isEditing?: boolean;
    isMutating?: boolean;
    canStartEdit?: boolean;
    canDelete?: boolean;
    editInputYen?: string;
    editMemo?: string;
    onStartEdit?: (_history: HistoryItem) => void;
    onCancelEdit?: () => void;
    onSaveEdit?: (_historyId: string) => Promise<HistoryActionResult>;
    onDelete?: (_historyId: string) => Promise<HistoryActionResult>;
  };

  let {
    history,
    isEditing = false,
    isMutating = false,
    canStartEdit = true,
    canDelete = true,
    editInputYen = $bindable(""),
    editMemo = $bindable(""),
    onStartEdit = () => {},
    onCancelEdit = () => {},
    onSaveEdit = async () => ({ kind: "ignored" }),
    onDelete = async () => ({ kind: "ignored" }),
  }: Props = $props();
</script>

<li class:editing={isEditing}>
  <div class="history-row-header">
    <div class="history-meta">
      <strong>{history.operationType === "add" ? "追加" : "調整"}</strong>
      <time datetime={history.createdAt}>{history.createdAt}</time>
    </div>
    <div class="row-actions" aria-label="履歴操作">
      <button
        class="icon-button"
        type="button"
        onclick={() => onStartEdit(history)}
        disabled={!canStartEdit}
      >
        <Pencil size={16} strokeWidth={2.4} aria-hidden="true" />
        編集
      </button>
      <button
        class="icon-button danger"
        type="button"
        onclick={() => onDelete(history.id)}
        disabled={!canDelete}
      >
        <Trash2 size={16} strokeWidth={2.4} aria-hidden="true" />
        削除
      </button>
    </div>
  </div>
  {#if isEditing}
    <form
      class="inline-edit"
      onsubmit={(event) => {
        event.preventDefault();
        void onSaveEdit(history.id);
      }}
    >
      <label>
        入力額 (円)
        <input
          type="text"
          inputmode="numeric"
          bind:value={editInputYen}
          disabled={isMutating}
        />
      </label>
      <label>
        メモ
        <textarea rows="2" bind:value={editMemo} disabled={isMutating}
        ></textarea>
      </label>
      <div class="edit-actions">
        <button class="save-button" type="submit" disabled={isMutating}>
          <Save size={16} strokeWidth={2.4} aria-hidden="true" />
          保存
        </button>
        <button
          class="cancel-button"
          type="button"
          onclick={onCancelEdit}
          disabled={isMutating}
        >
          <X size={16} strokeWidth={2.4} aria-hidden="true" />
          キャンセル
        </button>
      </div>
    </form>
  {:else}
    <p class="history-input">
      <span>入力</span>
      <strong>{history.inputYen} 円</strong>
    </p>
    <dl class="history-change">
      <div>
        <dt>変更前</dt>
        <dd>{history.beforeTotalYen} 円</dd>
      </div>
      <div>
        <dt>変更後</dt>
        <dd>{history.afterTotalYen} 円</dd>
      </div>
    </dl>
    {#if history.memo}
      <p class="history-memo"><span>メモ</span>{history.memo}</p>
    {/if}
  {/if}
</li>

<style>
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

  .history-input {
    align-items: baseline;
    display: flex;
    gap: 0.5rem;
  }

  .history-input span,
  dt,
  .history-memo span {
    color: #76675b;
    font-size: 0.78rem;
    font-weight: 800;
  }

  .history-change {
    display: flex;
    gap: 1rem;
    margin: 0;
  }

  .history-change div {
    align-items: baseline;
    display: flex;
    gap: 0.35rem;
  }

  dd {
    color: #2f2219;
    font-weight: 800;
    margin: 0;
  }

  .history-memo {
    overflow-wrap: anywhere;
  }

  .history-memo span {
    display: block;
    margin-bottom: 0.15rem;
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

  p,
  time {
    color: #76675b;
    font-size: 0.84rem;
  }

  p {
    margin: 0;
  }

  @media (max-width: 760px) {
    .history-row-header,
    .history-meta,
    .history-change,
    .history-change div,
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
  }
</style>
