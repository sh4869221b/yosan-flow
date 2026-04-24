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
  <div class="summary-header">
    <div>
      <p class="eyebrow">Yosan Flow</p>
      <h1>今の予算期間</h1>
    </div>
    <label>
      期間を切り替え
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
            {period.startDate} - {period.endDate}
          </option>
        {/each}
      </select>
    </label>
  </div>

  {#if summary}
    <p class="period-line" data-testid="period-id">
      {summary.periodId} / {summary.startDate} - {summary.endDate} / {summary.periodLengthDays} 日
    </p>
    <p class="period-line">期間: {summary.startDate} - {summary.endDate}</p>

    <div class="stats">
      <p data-testid="budget-value">
        <span>期間予算</span>
        <strong>{summary.budgetYen} 円</strong>
      </p>
      <p>
        <span>残額</span>
        <strong>{summary.remainingYen} 円</strong>
      </p>
      <p>
        <span>今日の目安</span>
        <strong>{summary.todayRecommendedYen} 円</strong>
      </p>
      <p>
        <span>残り日数</span>
        <strong>{summary.daysRemaining} 日</strong>
      </p>
    </div>

    {#if summary.overspentYen > 0}
      <p role="status">予算を {summary.overspentYen} 円 超過しています。</p>
    {/if}

    {#if errorMessage}
      <p role="alert">{errorMessage}</p>
    {/if}

    <form class="budget-form" on:submit={submitPeriod}>
      <label>
        予算だけ変更
        <input
          aria-label="期間予算 (円)"
          type="number"
          min="0"
          bind:value={budgetInput}
          disabled={saving || loading}
        />
      </label>
      <button type="submit" disabled={saving || loading}>
        {saving ? "保存中..." : loading ? "読込中..." : "期間を更新"}
      </button>
    </form>
  {/if}
</section>

<style>
  section {
    background: #201b16;
    border-radius: 28px;
    color: #fffaf1;
    padding: 1.4rem;
  }

  .summary-header {
    align-items: start;
    display: flex;
    gap: 1rem;
    justify-content: space-between;
  }

  .eyebrow {
    color: #f0b25a;
    font-size: 0.8rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    margin: 0;
    text-transform: uppercase;
  }

  h1 {
    font-size: clamp(2rem, 5vw, 4rem);
    letter-spacing: -0.06em;
    line-height: 0.95;
    margin: 0.15rem 0 0;
  }

  label {
    color: #eadcc7;
    display: grid;
    font-weight: 700;
    gap: 0.35rem;
  }

  select,
  input {
    background: #fffaf1;
    border: 0;
    border-radius: 12px;
    color: #201b16;
    font: inherit;
    min-height: 2.5rem;
    padding: 0 0.75rem;
  }

  .period-line {
    color: #ccbda9;
    margin: 1rem 0 0;
  }

  .stats {
    display: grid;
    gap: 0.7rem;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    margin: 1.2rem 0;
  }

  .stats p {
    border-left: 1px solid rgba(255, 250, 241, 0.22);
    margin: 0;
    padding-left: 0.9rem;
  }

  .stats span {
    color: #ccbda9;
    display: block;
    font-size: 0.85rem;
  }

  .stats strong {
    display: block;
    font-size: clamp(1.1rem, 2.4vw, 1.8rem);
    letter-spacing: -0.04em;
    margin-top: 0.2rem;
  }

  .budget-form {
    align-items: end;
    display: flex;
    gap: 0.75rem;
  }

  button {
    background: #f0b25a;
    border: 0;
    border-radius: 12px;
    color: #201b16;
    cursor: pointer;
    font: inherit;
    font-weight: 800;
    min-height: 2.5rem;
    padding: 0 1rem;
  }

  @media (max-width: 760px) {
    .summary-header,
    .budget-form {
      display: grid;
    }

    .stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
