<script lang="ts">
  type HeaderSummary = {
    readonly periodId: string;
    readonly startDate: string;
    readonly endDate: string;
    readonly periodLengthDays: number;
  };

  type PeriodOption = {
    readonly id: string;
    readonly startDate: string;
    readonly endDate: string;
  };

  type Props = {
    readonly summary: HeaderSummary | null;
    readonly periods: readonly PeriodOption[];
    readonly selectedPeriodId: string | null;
    readonly saving: boolean;
    readonly loading: boolean;
    readonly selectPeriod: (_payload: { readonly periodId: string }) => void;
  };

  let {
    summary,
    periods,
    selectedPeriodId,
    saving,
    loading,
    selectPeriod,
  }: Props = $props();

  function handleSelectPeriod(event: Event): void {
    if (!(event.currentTarget instanceof HTMLSelectElement)) {
      return;
    }
    selectPeriod({ periodId: event.currentTarget.value });
  }
</script>

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
{/if}

<style>
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
