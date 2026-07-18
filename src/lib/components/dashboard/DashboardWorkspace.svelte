<script lang="ts">
  import { CalendarDays } from "@lucide/svelte";
  import { createDashboardPageController } from "$lib/dashboard/page-controller.svelte";
  import BudgetSummary from "$lib/components/BudgetSummary.svelte";
  import PeriodCalendar from "$lib/components/PeriodCalendar.svelte";
  import CreatePeriodPanel from "./CreatePeriodPanel.svelte";
  import PeriodSettingsPanel from "./PeriodSettingsPanel.svelte";

  type Controller = ReturnType<typeof createDashboardPageController>;

  type Props = {
    controller: Controller;
  };

  let { controller }: Props = $props();
</script>

<section class="workspace-shell">
  <BudgetSummary
    summary={controller.summary}
    periods={controller.periods}
    selectedPeriodId={controller.selectedPeriodId}
    saving={controller.periodSaving}
    interactionDisabled={controller.periodInteractionDisabled}
    loading={controller.summaryLoading}
    errorMessage={controller.periodError}
    savePeriod={controller.handleSavePeriod}
    selectPeriod={controller.handleSelectPeriod}
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
        {#if controller.summaryLoading}
          <p class="loading-pill">読み込み中...</p>
        {/if}
      </div>

      {#if controller.summaryError}
        <p role="alert">{controller.summaryError}</p>
      {/if}

      <PeriodCalendar
        rows={controller.summary.dailyRows}
        startDate={controller.summary.startDate}
        endDate={controller.summary.endDate}
        loading={controller.summaryLoading}
        requestEdit={controller.openDayEntry}
      />
    </section>
  {/if}

  <section class="secondary-actions" aria-label="期間設定">
    <PeriodSettingsPanel {controller} />
    <CreatePeriodPanel variant="secondary-action" {controller} />
  </section>
</section>

<style>
  .workspace-shell {
    display: grid;
    gap: 1rem;
    grid-template-columns: minmax(0, 1.45fr) minmax(20rem, 0.9fr);
  }

  .workspace-shell > :global(:first-child) {
    grid-column: 1 / -1;
  }

  .primary-workspace {
    background: #fffdf8;
    border: 1px solid #e4ddd2;
    border-radius: 12px;
    box-shadow: 0 18px 60px rgba(51, 38, 26, 0.07);
    padding: 1.15rem 1.25rem;
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

  .loading-pill {
    background: #2d5b45;
    border-radius: 999px;
    color: #fff;
    font-size: 0.85rem;
    margin-left: auto;
    padding: 0.45rem 0.75rem;
    white-space: nowrap;
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
