<script lang="ts">
  import { createEventDispatcher } from "svelte";

  type DailyRow = {
    date: string;
    label: "today" | "planned";
    usedYen: number;
    recommendedYen: number;
  };

  export let rows: DailyRow[] = [];
  export let loading = false;

  const dispatch = createEventDispatcher<{ "request-edit": { date: string } }>();
</script>

<section>
  <h2>今日以降一覧</h2>
  {#if loading}
    <p>読み込み中...</p>
  {/if}
  <table>
    <thead>
      <tr>
        <th>日付</th>
        <th>区分</th>
        <th>使用額</th>
        <th>推奨予算</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      {#each rows as row}
        <tr class:today={row.label === "today"}>
          <td>{row.date}</td>
          <td>{row.label === "today" ? "今日" : "予定支出"}</td>
          <td data-testid={`used-${row.date}`}>{row.usedYen} 円</td>
          <td>{row.recommendedYen} 円</td>
          <td>
            <button
              type="button"
              data-testid={`edit-${row.date}`}
              on:click={() => dispatch("request-edit", { date: row.date })}
            >
              入力
            </button>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</section>

<style>
  .today {
    font-weight: 700;
  }
</style>
