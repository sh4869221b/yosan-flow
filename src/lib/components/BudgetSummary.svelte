<script lang="ts">
  import BudgetPacePanel from "./budget/BudgetPacePanel.svelte";
  import BudgetStatsPanel from "./budget/BudgetStatsPanel.svelte";
  import BudgetPeriodForm from "./budget/BudgetPeriodForm.svelte";

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

  $effect(() => {
    if (!summary || budgetInputPeriodId === summary.periodId) {
      return;
    }
    budgetInput = String(summary.budgetYen);
    budgetInputPeriodId = summary.periodId;
  });

  function submitPeriod(event: Event): void {
    event.preventDefault();
    const budgetYen = Number.parseInt(budgetInput, 10);
    if (!Number.isInteger(budgetYen) || budgetYen < 0) {
      return;
    }
    savePeriod({ budgetYen });
  }

  function handleSelectPeriod(event: Event): void {
    selectPeriod({
      periodId: (event.currentTarget as HTMLSelectElement).value,
    });
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
  <div class="summary-header">
    <div class="title-row">
      <p class="eyebrow">Yosan Flow</p>
      <h1>今の予算期間</h1>
      {#if summary}
        <p class="period-chip">
          {summary.startDate} - {summary.endDate}
        </p>
      {/if}
    </div>
    <label class="period-select">
      <span>期間を切り替え</span>
      <select
        data-testid="period-select"
        value={selectedPeriodId ?? ""}
        onchange={handleSelectPeriod}
        disabled={saving || loading}
      >
        {#each periods as period (period.id)}
          <option value={period.id}>
            {period.startDate} - {period.endDate}
          </option>
        {/each}
      </select>
    </label>
  </div>

  {#if summary}
    <p class="period-line" data-testid="period-id">
      {summary.periodId} / {summary.periodLengthDays} 日
    </p>
    <p class="period-line">期間: {summary.startDate} - {summary.endDate}</p>

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
      {errorMessage}
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

  .summary-header {
    align-items: center;
    border-bottom: 1px solid #e9e1d6;
    display: flex;
    gap: 1.35rem;
    justify-content: space-between;
    padding-bottom: 1rem;
  }

  .title-row {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 0.85rem 1.25rem;
  }

  .eyebrow {
    border-right: 1px solid #e4ddd2;
    color: #3a2419;
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(1.55rem, 3vw, 2.15rem);
    font-weight: 800;
    letter-spacing: 0;
    margin: 0;
    padding-right: 1.25rem;
  }

  h1 {
    font-size: 1.35rem;
    letter-spacing: 0;
    line-height: 1.2;
    margin: 0;
  }

  .period-chip {
    color: #3f3127;
    font-size: 1.05rem;
    font-weight: 800;
    margin: 0;
    white-space: nowrap;
  }

  label {
    color: #4d4036;
    display: grid;
    font-weight: 700;
    gap: 0.35rem;
    min-width: 0;
  }

  .period-select {
    min-width: min(18rem, 100%);
  }

  .period-select span {
    font-size: 0.82rem;
  }

  select {
    background: #fff;
    border: 1px solid #ded3c6;
    border-radius: 8px;
    box-sizing: border-box;
    color: #2f2219;
    font: inherit;
    max-width: 100%;
    min-height: 2.65rem;
    padding: 0 0.85rem;
    width: 100%;
  }

  .period-line {
    color: #837366;
    margin: 0.85rem 0 0;
  }

  @media (max-width: 760px) {
    section {
      border-radius: 18px;
      padding: 0.95rem;
    }

    .summary-header {
      align-items: flex-start;
      display: grid;
      gap: 0.65rem;
      padding-bottom: 0.8rem;
    }

    .title-row {
      display: grid;
      gap: 0.35rem;
      grid-template-columns: 1fr auto;
      width: 100%;
    }

    .eyebrow {
      border: 0;
      font-size: 1.55rem;
      padding: 0;
    }

    h1 {
      align-self: center;
      font-size: 0.95rem;
      text-align: right;
    }

    .period-chip {
      grid-column: 1 / -1;
      font-size: 1rem;
      white-space: normal;
    }

    .period-select {
      width: 100%;
    }

    .period-line {
      display: none;
    }

    select {
      min-height: 2.45rem;
    }
  }
</style>
