<script lang="ts">
  import BudgetPacePanel from "./budget/BudgetPacePanel.svelte";
  import BudgetStatsPanel from "./budget/BudgetStatsPanel.svelte";
  import BudgetPeriodHeader from "./budget/BudgetPeriodHeader.svelte";

  type PeriodSummary = {
    periodId: string;
    startDate: string;
    endDate: string;
    budgetYen: number;
    status: "active" | "closed";
    periodLengthDays: number;
    spentToDateYen: number;
    plannedTotalYen: number;
    remainingYen: number;
    overspentYen: number;
    todayRecommendedYen: number;
    varianceFromRecommendationYen: number;
    remainingAfterDayYenPreview: number;
    daysRemaining: number;
    foodPace: {
      status: "bonus" | "adjustment" | "on_track";
      baseDailyYen: number;
      todayAllowanceYen: number;
      usedTodayYen: number;
      todayRemainingYen: number;
      todayBonusYen: number;
      adjustmentYen: number;
      totalAdjustmentYen: number;
    };
  };
  type PeriodOption = {
    id: string;
    startDate: string;
    endDate: string;
    status: "active" | "closed";
  };

  type Props = {
    summary?: PeriodSummary | null;
    periods?: PeriodOption[];
    selectedPeriodId?: string | null;
    saving?: boolean;
    interactionDisabled?: boolean;
    loading?: boolean;
    errorMessage?: string | null;
    savePeriod?: (_payload: { budgetYen: number }) => void;
    selectPeriod?: (_payload: { periodId: string }) => void;
  };

  let {
    summary = null,
    periods = [],
    selectedPeriodId = null,
    saving = false,
    interactionDisabled = false,
    loading = false,
    errorMessage = null,
    savePeriod = () => {},
    selectPeriod = () => {},
  }: Props = $props();

  const pace = $derived(summary?.foodPace ?? null);
  const paceStatusLabel = $derived(
    pace?.status === "bonus"
      ? "ボーナス"
      : pace?.status === "adjustment"
        ? "マイナス調整"
        : "基準どおり",
  );
</script>

<section>
  <BudgetPeriodHeader
    {summary}
    {periods}
    {selectedPeriodId}
    saving={saving || interactionDisabled}
    {loading}
    {selectPeriod}
  />

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

  @media (max-width: 760px) {
    section {
      border-radius: 18px;
      padding: 0.95rem;
    }
  }
</style>
