<script lang="ts">
  import { createEventDispatcher } from "svelte";

  export let open = false;
  export let date: string | null = null;
  export let currentUsedYen = 0;
  export let isPlanned = false;
  export let saving = false;
  export let errorMessage: string | null = null;

  const dispatch = createEventDispatcher<{
    close: undefined;
    save: { date: string; inputYen: number; operation: "add" | "overwrite"; memo: string };
  }>();

  let inputYen = "";
  let memo = "";
  let operation: "add" | "overwrite" = "add";
  let previewAfterYen = 0;

  $: if (!open) {
    inputYen = "";
    memo = "";
    operation = "add";
  }

  $: previewAfterYen =
    operation === "add"
      ? currentUsedYen + (Number.parseInt(inputYen || "0", 10) || 0)
      : Number.parseInt(inputYen || "0", 10) || 0;

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

{#if open}
  <section aria-label="日次入力モーダル">
    <h2>日次入力</h2>
    {#if date}
      <p>対象日: {date}</p>
    {/if}
    {#if isPlanned}
      <p>予定支出として登録されます。</p>
    {/if}

    <p>変更前日次合計: {currentUsedYen} 円</p>
    <p>変更後日次合計（試算）: {previewAfterYen} 円</p>

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

    <button on:click={save} disabled={saving}>
      {saving ? "保存中..." : "保存する"}
    </button>
    <button on:click={() => dispatch("close")} disabled={saving}>閉じる</button>
  </section>
{/if}
