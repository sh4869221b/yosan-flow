<script lang="ts">
  import { Save, X } from "@lucide/svelte";
  import { tick, type Snippet } from "svelte";
  import { parseNonNegativeIntegerYenInput } from "$lib/dashboard/yen-input";

  const AMOUNT_ERROR = "入力額は 0 以上の整数で入力してください。";

  type Props = {
    inputYen?: string;
    memo?: string;
    saving?: boolean;
    close?: () => void;
    save?: (_payload: { date: string; inputYen: number; memo: string }) => void;
    date?: string | null;
    preview?: Snippet;
    saveError?: string | null;
  };

  let {
    inputYen = $bindable(""),
    memo = $bindable(""),
    saving = false,
    close = () => {},
    save = () => {},
    date = null,
    preview,
    saveError = null,
  }: Props = $props();

  let inputError = $state<string | null>(null);
  let amountInput: HTMLInputElement;
  let formHeading: HTMLHeadingElement;
  let saveErrorElement = $state<HTMLParagraphElement>();
  let submitFocusTarget: HTMLElement | null = null;

  $effect(() => {
    if (saveError == null) {
      return;
    }
    void tick().then(() => {
      saveErrorElement?.scrollIntoView({ block: "nearest" });
      if (submitFocusTarget?.isConnected) {
        if (document.activeElement === document.body) {
          submitFocusTarget.focus();
        }
        return;
      }
      formHeading?.focus();
    });
  });

  function handleAmountInput(event: Event): void {
    if (inputError == null) {
      return;
    }
    const value = (event.currentTarget as HTMLInputElement).value;
    inputError =
      parseNonNegativeIntegerYenInput(value) == null ? AMOUNT_ERROR : null;
  }

  function handleClose(): void {
    if (!saving) {
      close();
    }
  }

  async function handleSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!date || saving) {
      return;
    }
    const parsed = parseNonNegativeIntegerYenInput(inputYen);
    if (parsed == null) {
      inputError = AMOUNT_ERROR;
      await tick();
      amountInput.focus();
      amountInput.scrollIntoView({ block: "nearest" });
      return;
    }
    inputError = null;
    submitFocusTarget =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    save({ date, inputYen: parsed, memo });
  }
</script>

<form class="entry-form" onsubmit={handleSubmit}>
  <h3 id="day-entry-form-heading" tabindex="-1" bind:this={formHeading}>
    入力内容
  </h3>
  <label for="day-entry-amount">
    入力額 (円)
    <span class="money-input">
      <span aria-hidden="true">¥</span>
      <input
        id="day-entry-amount"
        type="text"
        inputmode="numeric"
        bind:this={amountInput}
        bind:value={inputYen}
        aria-invalid={inputError != null}
        aria-describedby={inputError ? "day-entry-amount-error" : undefined}
        oninput={handleAmountInput}
      />
    </span>
  </label>
  {#if inputError}
    <p id="day-entry-amount-error" class="error-message" role="alert">
      {inputError}
    </p>
  {/if}

  <label for="day-entry-memo">
    メモ
    <textarea
      id="day-entry-memo"
      rows="3"
      bind:value={memo}
      placeholder="例: ランチ、食材の買い物など"></textarea>
  </label>

  {#if preview}
    {@render preview()}
  {/if}

  <div class="actions">
    <button
      class="secondary-button"
      type="button"
      onclick={handleClose}
      disabled={saving}
    >
      <X size={18} strokeWidth={2.4} aria-hidden="true" />
      閉じる
    </button>
    <button class="primary-button" type="submit" disabled={saving}>
      <Save size={18} strokeWidth={2.4} aria-hidden="true" />
      {saving ? "保存中..." : "保存する"}
    </button>
  </div>

  {#if saveError}
    <p
      id="day-entry-save-error"
      class="error-message"
      role="alert"
      bind:this={saveErrorElement}
    >
      {saveError}
    </p>
  {/if}
</form>

<style>
  .entry-form {
    border: 1px solid #e7ddd0;
    border-radius: 10px;
    display: grid;
    gap: 0.9rem;
    padding: 1rem;
  }

  h3 {
    color: #2f2219;
    font-size: 1rem;
    margin: 0;
  }

  label {
    display: grid;
    font-weight: 800;
    gap: 0.45rem;
    min-width: 0;
  }

  .money-input {
    border: 1px solid #ded3c6;
    border-radius: 8px;
    display: grid;
    grid-template-columns: 3rem minmax(0, 1fr);
    overflow: hidden;
  }

  .money-input > span {
    align-items: center;
    background: #fbf6ee;
    border-right: 1px solid #ded3c6;
    color: #5d4a3b;
    display: inline-flex;
    font-weight: 900;
    justify-content: center;
  }

  input,
  textarea,
  button {
    box-sizing: border-box;
    font: inherit;
    max-width: 100%;
  }

  input,
  textarea {
    background: #fff;
    border: 1px solid #ded3c6;
    border-radius: 8px;
    color: #2f2219;
    width: 100%;
  }

  .money-input input {
    border: 0;
    border-radius: 0;
    font-size: 1.35rem;
    font-weight: 800;
    min-height: 3.15rem;
    padding: 0 0.85rem;
  }

  .error-message {
    background: #fff1f0;
    border: 1px solid #efc3bd;
    border-radius: 10px;
    color: #9b2c22;
    font-weight: 800;
    margin: 0;
    padding: 0.75rem 0.85rem;
  }

  textarea {
    min-height: 5.2rem;
    padding: 0.75rem 0.85rem;
    resize: vertical;
  }

  .actions {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
  }

  button {
    align-items: center;
    border-radius: 8px;
    cursor: pointer;
    display: inline-flex;
    font-weight: 900;
    gap: 0.45rem;
    justify-content: center;
    min-height: 3rem;
    padding: 0 1rem;
  }

  button:disabled {
    cursor: wait;
    opacity: 0.65;
  }

  .primary-button {
    background: #2f6d3b;
    border: 1px solid #2f6d3b;
    color: #fff;
  }

  .secondary-button {
    background: #fffdf8;
    border: 1px solid #d9cdbc;
    color: #2f2219;
  }

  @media (max-width: 760px) {
    .actions {
      grid-template-columns: 1fr;
    }
  }
</style>
