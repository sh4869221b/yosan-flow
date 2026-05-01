<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import {
    CalendarDays,
    JapaneseYen,
    Utensils,
    WalletCards,
  } from "lucide-svelte";

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
    pace?.status === "bonus"
      ? "ボーナス"
      : pace?.status === "adjustment"
        ? "マイナス調整"
        : "基準どおり";
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
        on:change={(event) =>
          dispatch("selectPeriod", {
            periodId: (event.currentTarget as HTMLSelectElement).value,
          })}
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
      <div class="today-pace" data-testid="food-pace-panel">
        <p class="allowance-card">
          <span class="food-icon" aria-hidden="true">
            <Utensils size={30} strokeWidth={2.4} />
          </span>
          <span>今日の食費枠</span>
          <strong data-testid="today-food-allowance"
            >{formatYen(pace.todayAllowanceYen)}</strong
          >
        </p>
        <p>
          <span>使用済み</span>
          <strong data-testid="today-food-used"
            >{formatYen(pace.usedTodayYen)}</strong
          >
        </p>
        <p>
          <span>残り</span>
          <strong data-testid="today-food-remaining"
            >{formatYen(pace.todayRemainingYen)}</strong
          >
        </p>
      </div>

      <div class="pace-details">
        <p data-testid="food-pace-status">
          <span>状態</span>
          <strong>{paceStatusLabel}</strong>
        </p>
        <p>
          <span>基準</span>
          <strong data-testid="base-daily-food"
            >{formatYen(pace.baseDailyYen)}</strong
          >
        </p>
        <p>
          <span>今日のボーナス</span>
          <strong data-testid="today-food-bonus"
            >+{formatYen(pace.todayBonusYen)}</strong
          >
        </p>
        <p>
          <span>調整</span>
          <strong data-testid="today-food-adjustment"
            >-{formatYen(pace.adjustmentYen)}</strong
          >
        </p>
      </div>
    {/if}

    <div class="stats">
      <p data-testid="budget-value">
        <span class="stat-label">
          <WalletCards size={17} strokeWidth={2.4} aria-hidden="true" />
          期間予算
        </span>
        <strong>{formatYen(summary.budgetYen)}</strong>
      </p>
      <p>
        <span class="stat-label">
          <JapaneseYen size={17} strokeWidth={2.4} aria-hidden="true" />
          期間残額
        </span>
        <strong>{formatYen(summary.remainingYen)}</strong>
      </p>
      <p>
        <span class="stat-label">
          <CalendarDays size={17} strokeWidth={2.4} aria-hidden="true" />
          残り日数
        </span>
        <strong>{summary.daysRemaining} 日</strong>
      </p>
    </div>

    {#if summary.overspentYen > 0}
      <p role="status">予算を {summary.overspentYen} 円 超過しています。</p>
    {/if}

    {#if errorMessage}
      <p role="alert">{errorMessage}</p>
    {/if}

    <details class="budget-disclosure" open>
      <summary>予算だけ変更</summary>
      <form class="budget-form" on:submit={submitPeriod}>
        <label>
          期間予算 (円)
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
    </details>
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

  select,
  input {
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

  .stats {
    display: grid;
    gap: 0;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin: 1rem 0 0;
    padding-top: 0.95rem;
    border-top: 1px solid #e9e1d6;
  }

  .today-pace,
  .pace-details {
    display: grid;
    gap: 0;
  }

  .today-pace {
    border: 1px solid #e4ddd2;
    border-radius: 12px;
    grid-template-columns: minmax(16rem, 1.35fr) repeat(2, minmax(9rem, 1fr));
    margin-top: 1rem;
    overflow: hidden;
  }

  .pace-details {
    border-top: 1px solid #e9e1d6;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    margin-top: 0.95rem;
    padding-top: 0.95rem;
  }

  .today-pace p,
  .pace-details p,
  .stats p {
    margin: 0;
    padding: 0 1rem;
  }

  .today-pace p {
    min-height: 7.2rem;
    padding: 1.15rem 1.45rem;
  }

  .today-pace p + p {
    border-left: 1px solid #e4ddd2;
  }

  .pace-details p + p,
  .stats p + p {
    border-left: 1px solid #e4ddd2;
  }

  .allowance-card {
    background: linear-gradient(90deg, #f3faf2, #fffdf8);
    position: relative;
  }

  .food-icon {
    align-items: center;
    background: #dcefd7;
    border-radius: 999px;
    color: #397d3d;
    display: inline-flex;
    font-size: 0.95rem;
    font-weight: 900;
    height: 3.8rem;
    justify-content: center;
    margin-right: 0.8rem;
    vertical-align: middle;
    width: 3.8rem;
  }

  .today-pace span,
  .pace-details span,
  .stats span {
    color: #56483d;
    display: block;
    font-size: 0.86rem;
    font-weight: 800;
  }

  .stats .stat-label {
    align-items: center;
    display: flex;
    gap: 0.35rem;
  }

  .stat-label :global(svg) {
    color: #397d3d;
    flex: 0 0 auto;
  }

  .today-pace strong,
  .pace-details strong,
  .stats strong {
    display: block;
    font-size: 1.3rem;
    letter-spacing: 0;
    margin-top: 0.2rem;
    white-space: nowrap;
  }

  .today-pace strong {
    color: #3e8445;
    font-size: clamp(2rem, 4.2vw, 3rem);
    line-height: 1.1;
  }

  .today-pace p:nth-child(2) strong {
    color: #3a2a20;
  }

  .today-pace p:nth-child(3) strong,
  .pace-details p:first-child strong,
  .stats p:nth-child(2) strong {
    color: #3e8445;
  }

  .budget-form {
    align-items: end;
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
    margin-top: 0.75rem;
  }

  .budget-disclosure {
    border-top: 1px solid #e9e1d6;
    margin-top: 0.9rem;
    padding-top: 0.75rem;
  }

  .budget-disclosure summary {
    color: #4d4036;
    cursor: pointer;
    font-weight: 800;
    list-style: none;
  }

  .budget-disclosure summary::-webkit-details-marker {
    display: none;
  }

  .budget-disclosure summary::after {
    color: #2f2219;
    content: "⌄";
    float: right;
    font-size: 1.1rem;
    line-height: 1;
  }

  .budget-disclosure[open] summary::after {
    content: "⌃";
  }

  button {
    background: #2f6d3b;
    border: 0;
    border-radius: 8px;
    color: #fff;
    cursor: pointer;
    font: inherit;
    font-weight: 800;
    min-height: 2.65rem;
    padding: 0 1rem;
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

    .today-pace {
      border-radius: 14px;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      margin-top: 0.7rem;
    }

    .allowance-card {
      grid-column: 1 / -1;
      text-align: center;
    }

    .today-pace p {
      min-height: 4.15rem;
      padding: 0.75rem;
    }

    .today-pace p + p {
      border-left: 0;
      border-top: 1px solid #e4ddd2;
    }

    .today-pace p:nth-child(3) {
      border-left: 1px solid #e4ddd2;
    }

    .pace-details,
    .stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      row-gap: 0.7rem;
    }

    .pace-details {
      margin-top: 0.75rem;
      padding-top: 0.75rem;
    }

    .stats {
      margin-top: 0.75rem;
      padding-top: 0.75rem;
    }

    .pace-details p,
    .stats p {
      padding: 0 0.55rem;
    }

    .pace-details p:nth-child(odd),
    .stats p:nth-child(odd) {
      border-left: 0;
    }

    .budget-form {
      display: grid;
      justify-content: stretch;
      margin-top: 0.75rem;
    }

    .period-line {
      display: none;
    }

    .food-icon {
      height: 2.75rem;
      width: 2.75rem;
    }

    .today-pace span,
    .pace-details span,
    .stats span {
      font-size: 0.78rem;
    }

    .today-pace strong {
      font-size: 1.8rem;
    }

    .pace-details strong,
    .stats strong {
      font-size: 1.05rem;
    }

    input,
    select,
    button {
      min-height: 2.45rem;
    }
  }
</style>
