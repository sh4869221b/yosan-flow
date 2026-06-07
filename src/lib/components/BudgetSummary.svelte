<script lang="ts">
  import BudgetPacePanel from "./budget/BudgetPacePanel.svelte";
  import BudgetStatsPanel from "./budget/BudgetStatsPanel.svelte";
  import BudgetPeriodForm from "./budget/BudgetPeriodForm.svelte";
  import BudgetPeriodHeader from "./budget/BudgetPeriodHeader.svelte";
  import { parseNonNegativeIntegerYenInput } from "$lib/dashboard/yen-input";

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
    loading = false,
    errorMessage = null,
    savePeriod = () => {},
    selectPeriod = () => {},
  }: Props = $props();

  let budgetInput = $state("");
  let budgetInputPeriodId = $state<string | null>(null);
  let budgetInputError = $state<string | null>(null);

  $effect(() => {
    if (!summary || budgetInputPeriodId === summary.periodId) {
      return;
    }
    budgetInput = String(summary.budgetYen);
    budgetInputPeriodId = summary.periodId;
    budgetInputError = null;
  });

  function submitPeriod(event: Event): void {
    event.preventDefault();
    const budgetYen = parseNonNegativeIntegerYenInput(budgetInput);
    if (budgetYen == null) {
      budgetInputError = "予算は 0 以上の整数で入力してください。";
      return;
    }
    budgetInputError = null;
    savePeriod({ budgetYen });
  }

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
    {saving}
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

    <BudgetPeriodForm
      bind:budgetInput
      {saving}
      {loading}
      errorMessage={budgetInputError ?? errorMessage}
      onsubmit={submitPeriod}
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
