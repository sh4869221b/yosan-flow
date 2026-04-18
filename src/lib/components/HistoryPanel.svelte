<script lang="ts">
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

  export let date: string | null = null;
  export let histories: HistoryItem[] = [];
  export let loading = false;
  export let errorMessage: string | null = null;
</script>

<section>
  <h2>履歴表示</h2>
  {#if date}
    <p>対象日: {date}</p>
  {/if}
  {#if loading}
    <p>履歴を読み込み中...</p>
  {/if}
  {#if errorMessage}
    <p role="alert">{errorMessage}</p>
  {/if}
  <ul>
    {#each histories as history}
      <li>
        {history.createdAt} / {history.operationType === "add" ? "追加" : "上書き"} / 入力
        {history.inputYen} 円 / 変更前 {history.beforeTotalYen} 円 / 変更後 {history.afterTotalYen} 円
        {#if history.memo}
          / {history.memo}
        {/if}
      </li>
    {/each}
  </ul>
</section>
