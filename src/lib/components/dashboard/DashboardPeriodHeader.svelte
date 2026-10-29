<script lang="ts">
  import { untrack } from "svelte";
  import { Label } from "#lib/components/ui/label/index.ts";
  import * as NativeSelect from "#lib/components/ui/native-select/index.ts";

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
    readonly interactionDisabled: boolean;
    readonly loading: boolean;
    readonly selectPeriod: (_payload: { readonly periodId: string }) => void;
  };

  let {
    summary,
    periods,
    selectedPeriodId,
    saving,
    interactionDisabled,
    loading,
    selectPeriod,
  }: Props = $props();

  let selectValue = $state(untrack(() => selectedPeriodId ?? ""));

  $effect(() => {
    // Roll back both the native selection and its binding after a failed switch.
    if (!loading) selectValue = selectedPeriodId ?? "";
  });

  function handleSelectPeriod(event: Event): void {
    if (!(event.currentTarget instanceof HTMLSelectElement)) {
      return;
    }
    selectPeriod({ periodId: event.currentTarget.value });
  }
</script>

<div class="summary-header" aria-busy={loading}>
  <div class="title-row">
    <h1 class="eyebrow" id="dashboard-heading" tabindex="-1">Yosan Flow</h1>
    <h2 id="selected-period-heading" tabindex="-1">今の予算期間</h2>
    {#if summary}
      <p class="period-chip">
        {summary.startDate} - {summary.endDate}
      </p>
    {/if}
  </div>
  <div class="period-select grid gap-1.5">
    <Label for="dashboard-period-select">期間を切り替え</Label>
    <NativeSelect.Root
      id="dashboard-period-select"
      class="w-full"
      data-testid="period-select"
      bind:value={selectValue}
      onchange={handleSelectPeriod}
      disabled={saving || interactionDisabled || loading}
    >
      {#each periods as period (period.id)}
        <NativeSelect.Option value={period.id}>
          {period.startDate} - {period.endDate}
        </NativeSelect.Option>
      {/each}
    </NativeSelect.Root>
    {#if loading}
      <span class="loading-status" role="status">読み込み中...</span>
    {/if}
  </div>
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
    border-bottom: 1px solid var(--border);
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
    border-right: 1px solid var(--border);
    color: #3a2419;
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(1.55rem, 3vw, 2.15rem);
    font-weight: 800;
    letter-spacing: 0;
    margin: 0;
    padding-right: 1.25rem;
  }

  h2 {
    font-size: 1.35rem;
    font-weight: 700;
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

  .period-select {
    min-width: min(18rem, 100%);
  }

  .period-select .loading-status {
    color: var(--muted-foreground);
    font-size: 0.82rem;
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

    h2 {
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
  }
</style>
