<script lang="ts">
  import { createEventDispatcher } from "svelte";
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
    save: { date: string; inputYen: number; operation: "add" | "overwrite"; memo: string };
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
      memo
    });
  }
</script>

{#if isOpen}
  <section aria-label="日次入力モーダル" data-testid="day-entry-modal">
    <h2>日次入力</h2>
    {#if date}
      <p>対象日: {date}</p>
    {/if}
    {#if isPlanned}
      <p>予定支出として登録されます。</p>
    {/if}

    <p>変更前日次合計: {currentUsedYen} 円</p>
    <p>変更後日次合計（試算）: {previewAfterYen} 円</p>
    {#if previewRemainingYen != null}
      <p>操作後の期間残額（試算）: {previewRemainingYen} 円</p>
    {/if}
    {#if previewRecommendedYen != null}
      <p>操作後の推奨予算（試算）: {previewRecommendedYen} 円</p>
    {/if}

    {#if errorMessage}
      <p role="alert">{errorMessage}</p>
    {/if}

    <label>
      入力額 (円)
      <input type="number" min="0" bind:value={inputYen} />
    </label>

    <fieldset>
      <legend>操作種別</legend>
      <label>
        <input type="radio" name="operation" value="add" bind:group={operation} />
        追加
      </label>
      <label>
        <input type="radio" name="operation" value="overwrite" bind:group={operation} />
        上書き
      </label>
    </fieldset>

    <label>
      メモ
      <input type="text" bind:value={memo} />
    </label>

    <button type="button" on:click={save} disabled={saving}>
      {saving ? "保存中..." : "保存する"}
    </button>
    <button type="button" on:click={() => dispatch("close")} disabled={saving}>閉じる</button>

    <HistoryPanel
      {date}
      {histories}
      loading={historyLoading}
      errorMessage={historyErrorMessage}
    />
  </section>
{/if}
