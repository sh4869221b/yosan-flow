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
    foodPace: {
      status: "bonus" | "adjustment" | "on_track";
      baseDailyYen: number;
      todayAllowanceYen: number;
      usedTodayYen: number;
      todayRemainingYen: number;
      todayBonusYen: number;
      adjustmentYen: number;
    };
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

  function formatYen(value: number): string {
    return `${value.toLocaleString("ja-JP")} 円`;
  }

  $: pace = summary?.foodPace ?? null;
  $: paceStatusLabel =
    pace?.status === "bonus" ? "ボーナス" : pace?.status === "adjustment" ? "マイナス調整" : "基準どおり";
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

    {#if pace}
      <div class="today-pace" data-testid="food-pace-panel">
        <p>
          <span>今日の食費枠</span>
          <strong data-testid="today-food-allowance">{formatYen(pace.todayAllowanceYen)}</strong>
        </p>
        <p>
          <span>使用済み</span>
          <strong data-testid="today-food-used">{formatYen(pace.usedTodayYen)}</strong>
        </p>
        <p>
          <span>残り</span>
          <strong data-testid="today-food-remaining">{formatYen(pace.todayRemainingYen)}</strong>
        </p>
      </div>

      <div class="pace-details">
        <p data-testid="food-pace-status">
          <span>状態</span>
          <strong>{paceStatusLabel}</strong>
        </p>
        <p>
          <span>基準</span>
          <strong data-testid="base-daily-food">{formatYen(pace.baseDailyYen)}</strong>
        </p>
        <p>
          <span>今日のボーナス</span>
          <strong data-testid="today-food-bonus">+{formatYen(pace.todayBonusYen)}</strong>
        </p>
        <p>
          <span>調整</span>
          <strong data-testid="today-food-adjustment">-{formatYen(pace.adjustmentYen)}</strong>
        </p>
      </div>
    {/if}

    <div class="stats">
      <p data-testid="budget-value">
        <span>期間予算</span>
        <strong>{formatYen(summary.budgetYen)}</strong>
      </p>
      <p>
        <span>期間残額</span>
        <strong>{formatYen(summary.remainingYen)}</strong>
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
    border-radius: 8px;
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
    letter-spacing: 0;
    margin: 0;
    text-transform: uppercase;
  }

  h1 {
    font-size: 2.35rem;
    letter-spacing: 0;
    line-height: 1;
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
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin: 1.2rem 0;
  }

  .today-pace,
  .pace-details {
    display: grid;
    gap: 0.7rem;
  }

  .today-pace {
    grid-template-columns: 1.35fr 1fr 1fr;
    margin-top: 1.25rem;
  }

  .pace-details {
    border-top: 1px solid rgba(255, 250, 241, 0.18);
    grid-template-columns: repeat(4, minmax(0, 1fr));
    margin-top: 1rem;
    padding-top: 1rem;
  }

  .today-pace p,
  .pace-details p,
  .stats p {
    border-left: 1px solid rgba(255, 250, 241, 0.22);
    margin: 0;
    padding-left: 0.9rem;
  }

  .today-pace span,
  .pace-details span,
  .stats span {
    color: #ccbda9;
    display: block;
    font-size: 0.85rem;
  }

  .today-pace strong,
  .pace-details strong,
  .stats strong {
    display: block;
    font-size: 1.35rem;
    letter-spacing: 0;
    margin-top: 0.2rem;
  }

  .today-pace strong {
    font-size: 2rem;
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

    h1 {
      font-size: 2rem;
    }

    .today-pace,
    .pace-details,
    .stats {
      grid-template-columns: 1fr;
    }
  }
</style>
