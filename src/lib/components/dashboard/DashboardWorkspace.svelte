<script lang="ts">
  import { tick } from "svelte";
  import { CalendarDays } from "@lucide/svelte";
  import { createDashboardPageController } from "$lib/dashboard/page-controller.svelte";
  import BudgetSummary from "$lib/components/BudgetSummary.svelte";
  import PeriodCalendar from "$lib/components/PeriodCalendar.svelte";
  import CreatePeriodPanel from "./CreatePeriodPanel.svelte";
  import DashboardPeriodHeader from "./DashboardPeriodHeader.svelte";
  import PeriodSettingsPanel from "./PeriodSettingsPanel.svelte";

  type Controller = ReturnType<typeof createDashboardPageController>;

  type Props = {
    controller: Controller;
  };

  let { controller }: Props = $props();
  let focusIntent = $state<"selection" | "retry" | null>(null);
  let requestedPeriodId = $state<string | null>(null);

  function focusTarget(selector: string): void {
    void tick().then(() =>
      document.querySelector<HTMLElement>(selector)?.focus(),
    );
  }

  function restoreSelectedPeriod(): void {
    const select = document.querySelector('[data-testid="period-select"]');
    if (select instanceof HTMLSelectElement && controller.selectedPeriodId) {
      select.value = controller.selectedPeriodId;
    }
  }

  function selectPeriod(payload: { readonly periodId: string }): void {
    requestedPeriodId = payload.periodId;
    focusIntent = "selection";
    controller.handleSelectPeriod(payload);
  }

  function retrySummary(): void {
    const periodId =
      requestedPeriodId ??
      controller.selectedPeriodId ??
      controller.periods[0]?.id;
    if (!periodId) return;
    requestedPeriodId = periodId;
    focusIntent = "retry";
    controller.handleSelectPeriod({ periodId });
  }

  $effect(() => {
    if (!focusIntent || controller.summaryLoading) return;

    if (controller.summaryError) {
      if (focusIntent === "selection") restoreSelectedPeriod();
      focusTarget(
        focusIntent === "retry"
          ? "#page-error-heading"
          : '[data-testid="period-select"]',
      );
      focusIntent = null;
      return;
    }

    if (
      requestedPeriodId &&
      controller.summary?.periodId === requestedPeriodId
    ) {
      focusTarget("#selected-period-heading");
      focusIntent = null;
    }
  });
</script>

<section class="workspace-shell">
  {#if controller.periods.length === 0 && !controller.summaryLoading && !controller.summaryError}
    <section
      class="empty-state card"
      data-testid="create-period-panel"
      aria-labelledby="empty-period-heading"
    >
      <span class="heading-icon" aria-hidden="true">
        <CalendarDays size={25} strokeWidth={2.4} />
      </span>
      <p class="eyebrow">Step 1</p>
      <h1 id="empty-period-heading" tabindex="-1">最初の予算期間を作成</h1>
      <p>
        まずは使う期間と総予算を決めます。作成後はカレンダーの日付を押して支出を入力できます。
      </p>
      <CreatePeriodPanel variant="empty-state" {controller} />
    </section>
  {:else}
    <DashboardPeriodHeader
      summary={controller.summary}
      periods={controller.periods}
      selectedPeriodId={controller.selectedPeriodId}
      saving={controller.periodSaving}
      interactionDisabled={controller.periodInteractionDisabled}
      loading={controller.summaryLoading}
      {selectPeriod}
    />

    {#if controller.summaryError || focusIntent === "retry"}
      <section
        aria-labelledby="page-error-heading"
        aria-busy={controller.summaryLoading}
      >
        <h2 id="page-error-heading" tabindex="-1">読み込みに失敗しました</h2>
        {#if controller.summaryError}
          <p role="alert">{controller.summaryError}</p>
        {:else}
          <p role="status">読み込み中...</p>
        {/if}
        <button type="button" onclick={retrySummary}>再読み込み</button>
      </section>
    {/if}

    <BudgetSummary
      summary={controller.summary}
      loading={controller.summaryLoading}
    />

    {#if controller.summary}
      <section class="primary-workspace" aria-label="日別入力">
        <div class="workspace-heading">
          <span class="heading-icon" aria-hidden="true">
            <CalendarDays size={25} strokeWidth={2.4} />
          </span>
          <div>
            <p class="eyebrow">Step 1</p>
            <h2>カレンダーの日付を選んで入力</h2>
            <p>日付を押すと、その日の入力と履歴をまとめて確認できます。</p>
          </div>
        </div>

        <section aria-labelledby="period-calendar-heading">
          <h2 id="period-calendar-heading">カレンダー</h2>
          <PeriodCalendar
            rows={controller.summary.dailyRows}
            startDate={controller.summary.startDate}
            endDate={controller.summary.endDate}
            loading={controller.summaryLoading}
            requestEdit={controller.openDayEntry}
          />
        </section>
      </section>
    {/if}

    <section class="secondary-actions">
      <section aria-labelledby="period-settings-heading">
        <h2 id="period-settings-heading">期間設定</h2>
        <PeriodSettingsPanel {controller} />
      </section>
      <details class="card" data-testid="create-period-panel">
        <summary>次の予算期間を作成する</summary>
        <div class="details-body">
          <CreatePeriodPanel variant="secondary-action" {controller} />
        </div>
      </details>
    </section>
  {/if}
</section>

<style>
  .workspace-shell {
    display: grid;
    gap: 1rem;
    grid-template-columns: minmax(0, 1.45fr) minmax(20rem, 0.9fr);
  }

  .workspace-shell > :global(.summary-header),
  .workspace-shell > section[aria-labelledby="page-error-heading"],
  .workspace-shell
    > :global(section[aria-labelledby="budget-summary-heading"]) {
    grid-column: 1 / -1;
  }

  .primary-workspace {
    background: #fffdf8;
    border: 1px solid #e4ddd2;
    border-radius: 12px;
    box-shadow: 0 18px 60px rgba(51, 38, 26, 0.07);
    padding: 1.15rem 1.25rem;
  }

  .empty-state,
  .secondary-actions > section,
  .workspace-shell > section[aria-labelledby="page-error-heading"] {
    background: #fffdf8;
    border: 1px solid #e4ddd2;
    border-radius: 12px;
    box-shadow: 0 18px 60px rgba(51, 38, 26, 0.07);
    padding: 1.15rem 1.25rem;
  }

  .empty-state p {
    color: #76675b;
  }

  .secondary-actions h2,
  #period-calendar-heading {
    display: none;
  }

  .secondary-actions summary {
    cursor: pointer;
    font-weight: 800;
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

  .details-body {
    border-top: 1px solid #e2d7c4;
    margin-top: 1rem;
    padding-top: 1rem;
  }

  .workspace-heading {
    align-items: center;
    display: flex;
    gap: 1rem;
    margin-bottom: 0.9rem;
  }

  .workspace-heading > div {
    flex: 1 1 auto;
    min-width: 0;
  }

  .heading-icon {
    align-items: center;
    background: #e1f0dd;
    border-radius: 999px;
    color: #397d3d;
    display: inline-flex;
    flex: 0 0 auto;
    height: 2.75rem;
    justify-content: center;
    width: 2.75rem;
  }

  .workspace-heading h2 {
    color: #2f2219;
    font-size: clamp(1.25rem, 2vw, 1.55rem);
    letter-spacing: 0;
    line-height: 1.1;
    margin: 0;
  }

  .workspace-heading p {
    color: #76675b;
    margin: 0;
  }

  .workspace-heading div > p:not(.eyebrow) {
    margin-top: 0.35rem;
  }

  .eyebrow {
    color: #357b3d;
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .secondary-actions {
    display: grid;
    gap: 0.75rem;
    align-content: start;
  }

  @media (max-width: 900px) {
    .workspace-shell {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 760px) {
    .primary-workspace {
      border-radius: 18px;
      padding: 0.95rem;
    }

    .workspace-heading {
      align-items: flex-start;
      display: flex;
    }

    .workspace-heading h2 {
      font-size: 1.05rem;
      line-height: 1.25;
    }

    .workspace-heading div > p:not(.eyebrow) {
      display: none;
    }
  }
</style>
