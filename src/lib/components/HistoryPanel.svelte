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
      {#each histories as history}
        <li>
          <div>
            <strong
              >{history.operationType === "add" ? "追加" : "上書き"}</strong
            >
            <time datetime={history.createdAt}>{history.createdAt}</time>
          </div>
          <p>
            入力 {history.inputYen} 円 / 変更前 {history.beforeTotalYen} 円 / 変更後
            {history.afterTotalYen} 円
          </p>
          {#if history.memo}
            <small>{history.memo}</small>
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

  li > div {
    align-items: baseline;
    display: flex;
    gap: 0.75rem;
    justify-content: space-between;
  }

  strong {
    color: #397d3d;
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
