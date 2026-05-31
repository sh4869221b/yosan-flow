<script lang="ts">
  import { Save, X } from "@lucide/svelte";

  type Props = {
    inputYen?: string;
    memo?: string;
    saving?: boolean;
    close?: () => void;
    save?: (_payload: { date: string; inputYen: number; memo: string }) => void;
    date?: string | null;
  };

  let {
    inputYen = $bindable(""),
    memo = $bindable(""),
    saving = false,
    close = () => {},
    save = () => {},
    date = null,
  }: Props = $props();

  function handleSubmit(event: SubmitEvent): void {
    event.preventDefault();
    if (!date) {
      return;
    }
    const parsed = Number.parseInt(inputYen, 10);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return;
    }

    save({
      date,
      inputYen: parsed,
      memo,
    });
  }
</script>

<form class="entry-form" onsubmit={handleSubmit}>
  <h3>入力内容</h3>
  <label>
    入力額 (円)
    <span class="money-input">
      <span aria-hidden="true">¥</span>
      <input type="number" min="0" inputmode="numeric" bind:value={inputYen} />
    </span>
  </label>

  <label>
    メモ
    <textarea
      rows="3"
      bind:value={memo}
      placeholder="例: ランチ、食材の買い物など"
    ></textarea>
  </label>

  <div class="actions">
    <button
      class="secondary-button"
      type="button"
      onclick={close}
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
    letter-spacing: 0;
    margin: 0;
  }

  label {
    display: grid;
    font-weight: 800;
    gap: 0.45rem;
    margin: 0;
    min-width: 0;
  }

  .money-input {
    align-items: center;
    background: #fff;
    border: 1px solid #ded3c6;
    border-radius: 8px;
    display: grid;
    grid-template-columns: 3rem minmax(0, 1fr);
    min-height: 3.15rem;
    overflow: hidden;
  }

  .money-input > span {
    align-items: center;
    align-self: stretch;
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
