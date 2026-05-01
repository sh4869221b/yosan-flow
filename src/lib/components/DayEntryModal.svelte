<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import {
    CheckCircle2,
    CircleDollarSign,
    ClipboardList,
    PencilLine,
    RotateCcw,
    Save,
    Wallet,
    X,
  } from "lucide-svelte";
  import HistoryPanel from "$lib/components/HistoryPanel.svelte";

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

  export let isOpen = false;
  export let date: string | null = null;
  export let currentUsedYen = 0;
  export let isPlanned = false;
  export let saving = false;
  export let errorMessage: string | null = null;
  export let historyErrorMessage: string | null = null;
  export let historyLoading = false;
  export let histories: HistoryItem[] = [];
  export let inputYen = "";
  export let memo = "";
  export let operation: "add" | "overwrite" = "add";
  export let previewAfterYen = 0;
  export let previewRemainingYen: number | null = null;
  export let previewRecommendedYen: number | null = null;

  const dispatch = createEventDispatcher<{
    close: undefined;
    save: {
      date: string;
      inputYen: number;
      operation: "add" | "overwrite";
      memo: string;
    };
  }>();

  function save(): void {
    if (!date) {
      return;
    }
    const parsed = Number.parseInt(inputYen, 10);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return;
    }

    dispatch("save", {
      date,
      inputYen: parsed,
      operation,
      memo,
    });
  }

  function formatYen(value: number): string {
    return value.toLocaleString("ja-JP");
  }
</script>

{#if isOpen}
  <section
    class="day-entry-card"
    aria-label="日次入力モーダル"
    data-testid="day-entry-modal"
  >
    <div class="entry-header">
      <span class="entry-icon" aria-hidden="true">
        <ClipboardList size={24} strokeWidth={2.4} />
      </span>
      <div>
        <p class="eyebrow">Step 2</p>
        <h2>日次入力</h2>
      </div>
      {#if date}
        <p class="target-date">対象日: {date}</p>
      {/if}
    </div>

    {#if isPlanned}
      <p class="planned-note">予定支出として登録されます。</p>
    {/if}

    <div class="summary-grid" aria-label="入力前後の試算">
      <div class="summary-item">
        <span class="summary-icon warm" aria-hidden="true">
          <Wallet size={20} strokeWidth={2.4} />
        </span>
        <span class="summary-label">変更前</span>
        <strong>{formatYen(currentUsedYen)} 円</strong>
        <small>入力済みの金額</small>
      </div>
      <div class="summary-item">
        <span class="summary-icon green" aria-hidden="true">
          <PencilLine size={20} strokeWidth={2.4} />
        </span>
        <span class="summary-label">変更後</span>
        <strong>{formatYen(previewAfterYen)} 円</strong>
        <small>この操作後の金額</small>
      </div>
      {#if previewRemainingYen != null}
        <div class="summary-item">
          <span class="summary-icon green" aria-hidden="true">
            <CircleDollarSign size={20} strokeWidth={2.4} />
          </span>
          <span class="summary-label">期間残額</span>
          <strong>{formatYen(previewRemainingYen)} 円</strong>
          <small>操作後の残り予算</small>
        </div>
      {/if}
    </div>

    {#if previewRecommendedYen != null}
      <div class="recommendation-strip">
        <strong>推奨予算</strong>
        <span>1日あたり {formatYen(previewRecommendedYen)} 円</span>
      </div>
    {/if}

    {#if errorMessage}
      <p class="error-message" role="alert">{errorMessage}</p>
    {/if}

    <div class="entry-layout">
      <form class="entry-form" on:submit|preventDefault={save}>
        <h3>入力内容</h3>
        <label>
          入力額 (円)
          <span class="money-input">
            <span aria-hidden="true">¥</span>
            <input
              type="number"
              min="0"
              inputmode="numeric"
              bind:value={inputYen}
            />
          </span>
        </label>

        <fieldset>
          <legend>操作種別</legend>
          <div class="operation-grid">
            <label class:active={operation === "add"}>
              <input
                type="radio"
                name="operation"
                value="add"
                bind:group={operation}
              />
              <CheckCircle2 size={18} strokeWidth={2.4} aria-hidden="true" />
              <span>
                <strong>追加</strong>
                <small>現在の金額に加算します</small>
              </span>
            </label>
            <label class:active={operation === "overwrite"}>
              <input
                type="radio"
                name="operation"
                value="overwrite"
                bind:group={operation}
              />
              <RotateCcw size={18} strokeWidth={2.4} aria-hidden="true" />
              <span>
                <strong>上書き</strong>
                <small>現在の金額に置き換えます</small>
              </span>
            </label>
          </div>
        </fieldset>

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
            on:click={() => dispatch("close")}
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

      <HistoryPanel
        {date}
        {histories}
        loading={historyLoading}
        errorMessage={historyErrorMessage}
      />
    </div>
  </section>
{/if}

<style>
  .day-entry-card {
    background: #fffdf8;
    border: 1px solid #e4ddd2;
    border-radius: 12px;
    box-shadow: 0 18px 60px rgba(51, 38, 26, 0.07);
    display: grid;
    gap: 1rem;
    margin-top: 1rem;
    padding: 1.15rem 1.25rem;
  }

  .entry-header {
    align-items: center;
    display: flex;
    gap: 0.9rem;
    min-width: 0;
  }

  .entry-header > div {
    flex: 1 1 auto;
    min-width: 0;
  }

  .entry-icon,
  .summary-icon {
    align-items: center;
    border-radius: 999px;
    display: inline-flex;
    flex: 0 0 auto;
    justify-content: center;
  }

  .entry-icon {
    background: #e1f0dd;
    color: #397d3d;
    height: 2.75rem;
    width: 2.75rem;
  }

  .eyebrow {
    color: #357b3d;
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0;
    margin: 0;
    text-transform: uppercase;
  }

  h2,
  h3 {
    color: #2f2219;
    letter-spacing: 0;
    margin: 0;
  }

  h2 {
    font-size: 1.45rem;
    line-height: 1.1;
  }

  h3 {
    font-size: 1rem;
  }

  .target-date {
    background: #f7f0e7;
    border: 1px solid #e3d6c6;
    border-radius: 999px;
    color: #3a2a20;
    font-weight: 800;
    margin: 0;
    padding: 0.45rem 0.75rem;
    white-space: nowrap;
  }

  .planned-note {
    background: #fff7e8;
    border: 1px solid #ecd6aa;
    border-radius: 10px;
    color: #74501b;
    font-weight: 800;
    margin: 0;
    padding: 0.75rem 0.85rem;
  }

  .summary-grid {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .summary-item {
    align-items: start;
    border: 1px solid #e7ddd0;
    border-radius: 10px;
    display: grid;
    gap: 0.2rem;
    grid-template-columns: auto minmax(0, 1fr);
    padding: 0.85rem;
  }

  .summary-icon {
    grid-row: 1 / 4;
    height: 2.3rem;
    width: 2.3rem;
  }

  .summary-icon.warm {
    background: #f7ead4;
    color: #bd7416;
  }

  .summary-icon.green {
    background: #e3f0df;
    color: #397d3d;
  }

  .summary-label,
  small {
    color: #76675b;
    font-size: 0.78rem;
    font-weight: 800;
  }

  .summary-item strong {
    color: #2f2219;
    font-size: 1.45rem;
    line-height: 1.1;
  }

  .summary-item:nth-child(n + 2) strong {
    color: #397d3d;
  }

  .recommendation-strip {
    align-items: center;
    background: #fffaf0;
    border: 1px solid #eadcc9;
    border-radius: 10px;
    color: #3a2a20;
    display: flex;
    gap: 0.75rem;
    justify-content: space-between;
    padding: 0.85rem 1rem;
  }

  .recommendation-strip strong {
    color: #8a5a16;
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

  .entry-layout {
    display: grid;
    gap: 1rem;
    grid-template-columns: minmax(0, 1.15fr) minmax(18rem, 0.85fr);
  }

  .entry-form {
    border: 1px solid #e7ddd0;
    border-radius: 10px;
    display: grid;
    gap: 0.9rem;
    padding: 1rem;
  }

  label,
  fieldset {
    display: grid;
    font-weight: 800;
    gap: 0.45rem;
    margin: 0;
    min-width: 0;
  }

  fieldset {
    border: 0;
    padding: 0;
  }

  legend {
    color: #2f2219;
    font-weight: 800;
    margin-bottom: 0.45rem;
    padding: 0;
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

  .operation-grid {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .operation-grid label {
    align-items: center;
    border: 1px solid #e2d7c4;
    border-radius: 10px;
    cursor: pointer;
    display: grid;
    gap: 0.7rem;
    grid-template-columns: auto 1fr;
    padding: 0.8rem;
  }

  .operation-grid label.active {
    background: #f2fbf0;
    border-color: #3b8a46;
    color: #245d2f;
  }

  .operation-grid input {
    height: 1rem;
    margin: 0;
    width: 1rem;
  }

  .operation-grid span {
    display: grid;
    gap: 0.1rem;
  }

  .operation-grid strong {
    color: inherit;
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

  @media (max-width: 900px) {
    .entry-layout,
    .summary-grid {
      grid-template-columns: 1fr;
    }

    .summary-grid {
      gap: 0.6rem;
    }
  }

  @media (max-width: 760px) {
    .day-entry-card {
      border-radius: 18px;
      padding: 0.95rem;
    }

    .entry-header {
      align-items: flex-start;
    }

    .target-date {
      border-radius: 10px;
      font-size: 0.86rem;
      margin-left: auto;
      white-space: normal;
    }

    h2 {
      font-size: 1.2rem;
    }

    .summary-item {
      grid-template-columns: auto minmax(0, 1fr);
      padding: 0.75rem;
    }

    .operation-grid,
    .actions {
      grid-template-columns: 1fr;
    }
  }
</style>
