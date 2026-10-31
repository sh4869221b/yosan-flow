<script lang="ts">
  import type { PeriodSummary } from "#lib/dashboard/controller-types.ts";
  import * as Card from "#lib/components/ui/card/index.ts";
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
  <Card.Root class="gap-0">
    <Card.Header>
      <h2 id="budget-summary-heading" class="text-lg font-bold">
        予算サマリー
      </h2>
    </Card.Header>
    <Card.Content class="block">
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
        <p class="mt-4 text-muted-foreground">読み込み中...</p>
      {/if}
    </Card.Content>
  </Card.Root>
</section>
