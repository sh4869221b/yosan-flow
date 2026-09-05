<script lang="ts">
  import type { PeriodSummary } from "$lib/dashboard/controller-types";
  import BudgetPacePanel from "./budget/BudgetPacePanel.svelte";
  import BudgetStatsPanel from "./budget/BudgetStatsPanel.svelte";

  type Props = {
    readonly summary: PeriodSummary | null;
    readonly loading: boolean;
  };

  let { summary, loading }: Props = $props();

  const pace = $derived(summary?.foodPace ?? null);
  const paceStatusLabel = $derived(
    pace?.status === "bonus"
      ? "ボーナス"
      : pace?.status === "adjustment"
        ? "マイナス調整"
        : "基準どおり",
  );
</script>

<section aria-labelledby="budget-summary-heading">
  <h2 id="budget-summary-heading">予算サマリー</h2>
  {#if summary}
    {#if pace}
      <BudgetPacePanel {pace} {paceStatusLabel} />
    {/if}

    <BudgetStatsPanel
      budgetYen={summary.budgetYen}
      remainingYen={summary.remainingYen}
      daysRemaining={summary.daysRemaining}
      overspentYen={summary.overspentYen}
    />
  {:else if loading}
    <p>読み込み中...</p>
  {/if}
</section>

<style>
  section {
    background: #fffdf8;
    border: 1px solid #e4ddd2;
    border-radius: 14px;
    box-shadow: 0 18px 60px rgba(51, 38, 26, 0.07);
    color: #2f2219;
    padding: 1.15rem 1.25rem;
  }

  h2 {
    font-size: 1.1rem;
    margin: 0;
  }

  @media (max-width: 760px) {
    section {
      border-radius: 18px;
      padding: 0.95rem;
    }
  }
</style>
