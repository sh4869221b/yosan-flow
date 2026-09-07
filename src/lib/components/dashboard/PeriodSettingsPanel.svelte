<script lang="ts">
  import { Settings2 } from "@lucide/svelte";
  import { createDashboardPageController } from "$lib/dashboard/page-controller.svelte";
  import PeriodRangePicker from "$lib/components/PeriodRangePicker.svelte";
  import { getPeriodRangeValidation } from "$lib/components/period-range-state";
  import BudgetPeriodForm from "./BudgetPeriodForm.svelte";
  import PeriodBoundaryConfirmationDialog from "./PeriodBoundaryConfirmationDialog.svelte";

  type Controller = ReturnType<typeof createDashboardPageController>;

  type Props = {
    controller: Controller;
  };

  let { controller }: Props = $props();

  let touchedStart = $state(false);
  let touchedEnd = $state(false);
  let applyAttempted = $state(false);
  let syncedRange = $state(getRangeDraft());
  let localEdit = false;

  function getRangeDraft(): { startDate: string; endDate: string } {
    return { ...controller.range.draft };
  }

  const rangeValidation = $derived(
    getPeriodRangeValidation(controller.range.draft),
  );
  const showStartError = $derived(
    touchedStart || applyAttempted ? rangeValidation.startError : null,
  );
  const showEndError = $derived(
    touchedEnd || applyAttempted ? rangeValidation.endError : null,
  );
  const showRangeError = $derived(
    touchedStart || touchedEnd || applyAttempted
      ? rangeValidation.rangeError
      : null,
  );
  const rangeDisabled = $derived(
    controller.range.saving || controller.periodInteractionDisabled,
  );

  $effect(() => {
    const nextRange = controller.range.draft;
    if (
      nextRange.startDate === syncedRange.startDate &&
      nextRange.endDate === syncedRange.endDate
    ) {
      localEdit = false;
      return;
    }
    if (!localEdit) {
      touchedStart = false;
      touchedEnd = false;
      applyAttempted = false;
    }
    localEdit = false;
    syncedRange = { ...nextRange };
  });

  $effect(() => {
    if (!controller.range.success) return;
    touchedStart = false;
    touchedEnd = false;
    applyAttempted = false;
  });

  function updateRange(value: { startDate: string; endDate: string }): void {
    localEdit = true;
    controller.range.edit(value);
  }

  function markBlurred(field: "start" | "end"): void {
    if (field === "start") touchedStart = true;
    else touchedEnd = true;
  }

  function applyRange(): void {
    applyAttempted = true;
    if (!rangeValidation.isValid) {
      document
        .getElementById(
          rangeValidation.startError || rangeValidation.rangeError
            ? "current-period-range-start"
            : "current-period-range-end",
        )
        ?.focus();
      return;
    }
    controller.saveRange();
  }

  function submitPeriod(event: Event): void {
    event.preventDefault();
    controller.saveBudget();
  }
</script>

<details class="card">
  <summary>
    <Settings2 size={20} strokeWidth={2.4} aria-hidden="true" />
    期間の終了日や予算を変更する
  </summary>
  <div class="details-body">
    <section aria-label="予算設定">
      <BudgetPeriodForm
        bind:budgetInput={controller.budget.draft}
        saving={controller.budget.saving}
        loading={controller.summaryLoading}
        interactionDisabled={controller.periodInteractionDisabled}
        errorMessage={controller.budget.validationError ??
          controller.budget.serverError}
        onsubmit={submitPeriod}
      />
    </section>

    <h2>期間設定</h2>
    <PeriodRangePicker
      value={controller.range.draft}
      onValueChange={updateRange}
      onFieldBlur={markBlurred}
      disabled={rangeDisabled}
      startId="current-period-range-start"
      endId="current-period-range-end"
      startError={showStartError}
      endError={showEndError}
      rangeError={showRangeError}
      testIdPrefix="current-period-range"
    />
    <button
      class="range-apply"
      type="button"
      data-testid="current-period-range-apply"
      disabled={rangeDisabled}
      onclick={applyRange}
    >
      {controller.range.saving ? "保存中..." : "期間を反映"}
    </button>
    {#if controller.range.serverError}
      <p role="alert">{controller.range.serverError}</p>
    {/if}
  </div>
</details>

<PeriodBoundaryConfirmationDialog
  proposal={controller.periodUpdateProposal}
  confirmSaving={controller.confirmSaving}
  confirm={controller.confirmPeriodUpdate}
  cancel={controller.cancelPeriodUpdateConfirmation}
/>

<style>
  h2 {
    color: #2f2219;
    font-size: clamp(1.25rem, 2vw, 1.55rem);
    letter-spacing: 0;
    line-height: 1.15;
    margin: 1rem 0 0;
  }

  .card {
    background: #fffdf8;
    border: 1px solid #e4ddd2;
    border-radius: 12px;
    box-shadow: 0 18px 60px rgba(51, 38, 26, 0.07);
    padding: 1.15rem 1.25rem;
  }

  details summary {
    align-items: center;
    cursor: pointer;
    display: flex;
    gap: 0.75rem;
    font-weight: 800;
    list-style: none;
    min-height: 3.8rem;
  }

  details summary :global(svg) {
    color: #397d3d;
    flex: 0 0 auto;
  }

  details summary::-webkit-details-marker {
    display: none;
  }

  details summary::after {
    color: #2f2219;
    content: "⌄";
    font-size: 1.35rem;
    line-height: 1;
    margin-left: auto;
  }

  details[open] summary::after {
    content: "⌃";
  }

  .details-body {
    border-top: 1px solid #e2d7c4;
    margin-top: 1rem;
    padding-top: 1rem;
  }

  .range-apply {
    background: #2f6d3b;
    border: 0;
    border-radius: 8px;
    box-sizing: border-box;
    color: #fff;
    cursor: pointer;
    font: inherit;
    font-weight: 800;
    max-width: 100%;
    min-height: 2.65rem;
    padding: 0 1rem;
  }

  .range-apply:disabled {
    cursor: wait;
    opacity: 0.65;
  }

  @media (max-width: 760px) {
    .card {
      border-radius: 18px;
      padding: 0.95rem;
    }

    details summary {
      min-height: 3rem;
    }
  }
</style>
