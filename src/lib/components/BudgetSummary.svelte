<script lang="ts">
  import { createEventDispatcher } from "svelte";

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
  };
  type PeriodOption = {
    id: string;
    startDate: string;
    endDate: string;
    status: "active" | "closed";
  };

  export let summary: PeriodSummary | null = null;
  export let periods: PeriodOption[] = [];
  export let selectedPeriodId: string | null = null;
  export let saving = false;
  export let loading = false;
  export let errorMessage: string | null = null;

  const dispatch = createEventDispatcher<{
    savePeriod: { budgetYen: number };
    selectPeriod: { periodId: string };
  }>();

  let budgetInput = "";
  let budgetInputPeriodId: string | null = null;

  $: if (summary && budgetInputPeriodId !== summary.periodId) {
    budgetInput = String(summary.budgetYen);
    budgetInputPeriodId = summary.periodId;
  }

  function submitPeriod(event: Event): void {
    event.preventDefault();
    const budgetYen = Number.parseInt(budgetInput, 10);
    if (!Number.isInteger(budgetYen) || budgetYen < 0) {
      return;
    }
    dispatch("savePeriod", { budgetYen });
  }
</script>

<section>
  <h1>Yosan Flow Dashboard</h1>

  <label>
    予算期間
    <select
      data-testid="period-select"
      value={selectedPeriodId ?? ""}
      on:change={(event) =>
        dispatch("selectPeriod", {
          periodId: (event.currentTarget as HTMLSelectElement).value
        })}
      disabled={saving || loading}
    >
      {#each periods as period}
        <option value={period.id}>
          {period.id} ({period.startDate} - {period.endDate})
        </option>
      {/each}
    </select>
  </label>

  {#if summary}
    <p data-testid="period-id">期間ID: {summary.periodId}</p>
    <p>期間: {summary.startDate} - {summary.endDate} ({summary.periodLengthDays} 日)</p>
    <p data-testid="budget-value">期間予算: {summary.budgetYen} 円</p>
    <p>ここまでの使用額: {summary.spentToDateYen} 円</p>
    <p>総使用予定額: {summary.plannedTotalYen} 円</p>
    <p>残額: {summary.remainingYen} 円</p>
    <p>超過額: {summary.overspentYen} 円</p>
    <p>今日の推奨予算: {summary.todayRecommendedYen} 円</p>
    <p>今日の推奨との差分: {summary.varianceFromRecommendationYen} 円</p>
    <p>残り日数: {summary.daysRemaining} 日</p>

    {#if summary.overspentYen > 0}
      <p role="status">予算を {summary.overspentYen} 円 超過しています。</p>
    {/if}

    {#if errorMessage}
      <p role="alert">{errorMessage}</p>
    {/if}

    <form on:submit={submitPeriod}>
      <label>
        期間予算 (円)
        <input type="number" min="0" bind:value={budgetInput} disabled={saving || loading} />
      </label>
      <button type="submit" disabled={saving || loading}>
        {saving ? "保存中..." : loading ? "読込中..." : "期間を更新"}
      </button>
    </form>
  {/if}
</section>
