<script lang="ts">
  import { Pencil, Save, Trash2, X } from "@lucide/svelte";
  import { tick } from "svelte";
  import type { HistoryActionResult, HistoryItem } from "$lib/dashboard/types";
  import { parseNonNegativeIntegerYenInput } from "$lib/dashboard/yen-input";

  const AMOUNT_ERROR = "入力額は 0 以上の整数で入力してください。";

  type EditFocusTarget = "amount" | "memo" | "save";

  type Props = {
    history: HistoryItem;
    isEditing?: boolean;
    isMutating?: boolean;
    isSaving?: boolean;
    mutationUnavailable?: boolean;
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
    isSaving = false,
    mutationUnavailable = false,
    canStartEdit = true,
    canDelete = true,
    editInputYen = $bindable(""),
    editMemo = $bindable(""),
    onStartEdit = () => {},
    onCancelEdit = () => {},
    onSaveEdit = async () => ({ kind: "ignored" }),
    onDelete = async () => ({ kind: "ignored" }),
  }: Props = $props();

  let amountInput = $state<HTMLInputElement | null>(null);
  let memoInput = $state<HTMLTextAreaElement | null>(null);
  let editButton = $state<HTMLButtonElement | null>(null);
  let saveButton = $state<HTMLButtonElement | null>(null);
  let focusedEditElement = $state<HTMLElement | null>(null);
  let focusedEditTarget = $state<EditFocusTarget | null>(null);
  let stopPendingFocusTracking = $state<(() => void) | null>(null);
  let inputError = $state<string | null>(null);
  let saveError = $state<string | null>(null);
  let saveSuccess = $state<string | null>(null);
  let submitting = $state(false);
  let shouldFocusAmount = $state(false);

  const isPending = $derived(submitting || isMutating || isSaving);

  $effect(() => {
    if (!isEditing || !shouldFocusAmount) {
      return;
    }
    void tick().then(() => {
      if (isEditing && shouldFocusAmount && !submitting) {
        shouldFocusAmount = false;
        amountInput?.focus();
      }
    });
  });

  $effect(() => {
    if (!isEditing && !isSaving && !isMutating) {
      stopPendingFocusTracking?.();
    }
  });

  function handleStartEdit(): void {
    shouldFocusAmount = true;
    inputError = null;
    saveError = null;
    saveSuccess = null;
    onStartEdit(history);
  }

  async function handleCancelEdit(): Promise<void> {
    inputError = null;
    saveError = null;
    saveSuccess = null;
    onCancelEdit();
    await tick();
    editButton?.focus();
  }

  function captureEditFocus(
    target: EditFocusTarget,
    element: EventTarget | null,
  ): void {
    focusedEditTarget = target;
    focusedEditElement = element instanceof HTMLElement ? element : null;
  }

  function handleInput(): void {
    if (
      inputError != null &&
      parseNonNegativeIntegerYenInput(editInputYen) != null
    ) {
      inputError = null;
    }
    saveError = null;
  }

  function restoreFailureFocus(
    submitFocusElement: Element | null,
    submitFocusTarget: EditFocusTarget | null,
    focusMovedWhilePending: boolean,
  ): void {
    if (
      submitFocusTarget == null ||
      submitFocusElement?.isConnected ||
      focusMovedWhilePending
    ) {
      return;
    }
    if (submitFocusTarget === "amount") {
      amountInput?.focus();
    } else if (submitFocusTarget === "memo") {
      memoInput?.focus();
    } else {
      saveButton?.focus();
    }
  }

  async function handleSaveEdit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (isPending || mutationUnavailable) {
      return;
    }
    const parsed = parseNonNegativeIntegerYenInput(editInputYen);
    if (parsed == null) {
      inputError = AMOUNT_ERROR;
      await tick();
      amountInput?.focus();
      return;
    }
    inputError = null;
    saveError = null;
    const submitFocusElement = focusedEditElement;
    const submitFocusTarget = focusedEditTarget;
    let focusMovedWhilePending = false;
    const trackPendingInteraction = (pendingEvent: Event): void => {
      if (pendingEvent.target !== submitFocusElement) {
        focusMovedWhilePending = true;
      }
    };
    submitting = true;
    const resultPromise = onSaveEdit(history.id);
    await tick();
    const stopTracking = (): void => {
      window.removeEventListener("focusin", trackPendingInteraction, true);
      window.removeEventListener("pointerdown", trackPendingInteraction, true);
      window.removeEventListener("input", trackPendingInteraction, true);
      if (stopPendingFocusTracking === stopTracking) {
        stopPendingFocusTracking = null;
      }
    };
    stopPendingFocusTracking = stopTracking;
    window.addEventListener("focusin", trackPendingInteraction, true);
    window.addEventListener("pointerdown", trackPendingInteraction, true);
    window.addEventListener("input", trackPendingInteraction, true);
    let result: HistoryActionResult;
    try {
      result = await resultPromise;
    } finally {
      stopTracking();
    }
    submitting = false;
    if (result.kind === "success") {
      saveSuccess = "履歴を更新しました。";
      await tick();
      editButton?.focus();
    } else if (result.kind === "failure") {
      saveError = result.message;
      await tick();
      restoreFailureFocus(
        submitFocusElement,
        submitFocusTarget,
        focusMovedWhilePending,
      );
    }
  }

  function handleEditKeydown(event: KeyboardEvent): void {
    if (event.key !== "Escape" || isPending) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    void handleCancelEdit();
  }
</script>

<li class:editing={isEditing}>
  <div class="history-row-header">
    <div class="history-meta">
      <strong>{history.operationType === "add" ? "追加" : "調整"}</strong>
      <time datetime={history.createdAt}>{history.createdAt}</time>
    </div>
    <div class="row-actions" aria-label="履歴操作">
      <button
        bind:this={editButton}
        class="icon-button"
        type="button"
        onclick={handleStartEdit}
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
    <form class="inline-edit" onsubmit={handleSaveEdit}>
      <label>
        入力額 (円)
        <input
          type="text"
          inputmode="numeric"
          bind:this={amountInput}
          bind:value={editInputYen}
          aria-invalid={inputError != null}
          aria-describedby={inputError
            ? `history-edit-${history.id}-amount-error`
            : undefined}
          disabled={isPending}
          oninput={handleInput}
          onfocus={(event) => captureEditFocus("amount", event.currentTarget)}
          onkeydown={handleEditKeydown}
        />
      </label>
      {#if inputError}
        <p
          id={`history-edit-${history.id}-amount-error`}
          class="error-message"
          role="alert"
        >
          {inputError}
        </p>
      {/if}
      <label>
        メモ
        <textarea
          rows="2"
          bind:this={memoInput}
          bind:value={editMemo}
          disabled={isPending}
          oninput={() => (saveError = null)}
          onfocus={(event) => captureEditFocus("memo", event.currentTarget)}
          onkeydown={handleEditKeydown}></textarea>
      </label>
      <div class="edit-actions">
        <button
          bind:this={saveButton}
          class="save-button"
          type="submit"
          disabled={isPending || mutationUnavailable}
          onfocus={(event) => captureEditFocus("save", event.currentTarget)}
          onkeydown={handleEditKeydown}
        >
          <Save size={16} strokeWidth={2.4} aria-hidden="true" />
          {isPending ? "保存中..." : "保存"}
        </button>
        <button
          class="cancel-button"
          type="button"
          onclick={handleCancelEdit}
          disabled={isPending}
          onkeydown={handleEditKeydown}
        >
          <X size={16} strokeWidth={2.4} aria-hidden="true" />
          キャンセル
        </button>
      </div>
      {#if isPending}
        <p class="edit-status" role="status">履歴を更新中です。</p>
      {:else if mutationUnavailable}
        <p class="edit-status" role="status">別の履歴を更新中です。</p>
      {/if}
      {#if saveError}
        <p class="error-message" role="alert">{saveError}</p>
      {/if}
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
    {#if isPending}
      <p class="edit-status" role="status">履歴を更新中です。</p>
    {:else if saveSuccess}
      <p class="edit-status" role="status">{saveSuccess}</p>
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

  .error-message {
    color: #9b2c22;
    font-weight: 800;
  }

  .edit-status {
    color: #276432;
    font-weight: 800;
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
