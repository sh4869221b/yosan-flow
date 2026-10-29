<script lang="ts">
  import type { PeriodSummary } from "#lib/dashboard/controller-types.ts";
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
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    box-shadow: var(--elevation-card);
    color: var(--card-foreground);
    padding: var(--panel-padding-block) var(--panel-padding-inline);
  }

  h2 {
    font-size: 1.1rem;
    font-weight: 700;
    margin: 0;
  }

  @media (max-width: 760px) {
    section {
      border-radius: var(--radius-2xl);
      padding: var(--panel-padding-mobile);
    }
  }
</style>
