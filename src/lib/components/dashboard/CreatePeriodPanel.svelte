<script lang="ts">
  import { createDashboardPageController } from "$lib/dashboard/page-controller.svelte";
  import PeriodRangePicker from "$lib/components/PeriodRangePicker.svelte";
  import { getPeriodRangeValidation } from "$lib/components/period-range-state";

  type Controller = ReturnType<typeof createDashboardPageController>;

  type Props = {
    variant: "empty-state" | "secondary-action";
    controller: Controller;
  };

  let { variant, controller }: Props = $props();

  function getControllerRange(): { startDate: string; endDate: string } {
    return {
      startDate: controller.createStartDate,
      endDate: controller.createEndDate,
    };
  }

  let rangeDraft = $state(getControllerRange());
  let syncedRange = $state(getControllerRange());
  let touchedStart = $state(false);
  let touchedEnd = $state(false);
  let applyAttempted = $state(false);

  const rangeValidation = $derived(getPeriodRangeValidation(rangeDraft));
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
    controller.periodSaving || controller.periodInteractionDisabled,
  );

  $effect(() => {
    const nextRange = {
      startDate: controller.createStartDate,
      endDate: controller.createEndDate,
    };
    if (
      nextRange.startDate === syncedRange.startDate &&
      nextRange.endDate === syncedRange.endDate
    ) {
      return;
    }
    syncedRange = nextRange;
    rangeDraft = { ...nextRange };
    touchedStart = false;
    touchedEnd = false;
    applyAttempted = false;
  });

  function updateRange(value: { startDate: string; endDate: string }): void {
    rangeDraft = value;
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
          rangeValidation.startError
            ? `${getRangePrefix()}-start`
            : `${getRangePrefix()}-end`,
        )
        ?.focus();
      return;
    }
    controller.updateCreatePeriodRange(rangeDraft);
  }

  function getRangePrefix(): string {
    return variant === "empty-state"
      ? "initial-period-range"
      : "create-period-range";
  }
</script>

{#if variant === "empty-state"}
  {#if controller.periodError}
    <p role="alert">{controller.periodError}</p>
  {/if}
  <label>
    期間ID
    <input
      aria-label="期間ID"
      type="text"
      bind:value={controller.createPeriodId}
      placeholder="p-2026-04-20"
    />
  </label>
  <PeriodRangePicker
    value={rangeDraft}
    onValueChange={updateRange}
    onFieldBlur={markBlurred}
    disabled={rangeDisabled}
    startId="initial-period-range-start"
    endId="initial-period-range-end"
    startError={showStartError}
    endError={showEndError}
    rangeError={showRangeError}
    testIdPrefix="initial-period-range"
  />
  <button
    type="button"
    data-testid="initial-period-range-apply"
    disabled={rangeDisabled}
    onclick={applyRange}
  >
    {controller.periodSaving ? "保存中..." : "期間を反映"}
  </button>
  <label>
    新規予算額 (円)
    <input
      aria-label="新規予算額 (円)"
      type="text"
      inputmode="numeric"
      bind:value={controller.createBudgetInput}
    />
  </label>
  <button
    type="button"
    onclick={controller.createInitialPeriod}
    disabled={controller.periodInteractionDisabled}
  >
    {controller.periodSaving ? "作成中..." : "期間を作成"}
  </button>
{:else}
  {#if controller.periodError}
    <p role="alert">{controller.periodError}</p>
  {/if}
  <p>
    今の期間が終わった後の期間を追加します。開始日は前期間の翌日が基本です。
  </p>
  <label>
    期間ID
    <input
      aria-label="期間ID"
      type="text"
      bind:value={controller.createPeriodId}
      placeholder="p-2026-04-20"
    />
  </label>
  <PeriodRangePicker
    value={rangeDraft}
    onValueChange={updateRange}
    onFieldBlur={markBlurred}
    disabled={rangeDisabled}
    startId="create-period-range-start"
    endId="create-period-range-end"
    startError={showStartError}
    endError={showEndError}
    rangeError={showRangeError}
    testIdPrefix="create-period-range"
  />
  <button
    type="button"
    data-testid="create-period-range-apply"
    disabled={rangeDisabled}
    onclick={applyRange}
  >
    {controller.periodSaving ? "保存中..." : "期間を反映"}
  </button>
  <label>
    新規予算額 (円)
    <input
      aria-label="新規予算額 (円)"
      type="text"
      inputmode="numeric"
      bind:value={controller.createBudgetInput}
    />
  </label>
  <button
    type="button"
    onclick={controller.createInitialPeriod}
    disabled={controller.periodInteractionDisabled}
  >
    {controller.periodSaving ? "作成中..." : "期間を作成"}
  </button>
{/if}

<style>
  label {
    display: grid;
    font-weight: 700;
    gap: 0.35rem;
    margin: 0.75rem 0;
    min-width: 0;
  }

  input,
  button {
    box-sizing: border-box;
    border-radius: 8px;
    font: inherit;
    max-width: 100%;
    min-height: 2.65rem;
  }

  input {
    background: #fff;
    border: 1px solid #ded3c6;
    color: #2f2219;
    padding: 0 0.85rem;
    width: 100%;
  }

  button {
    background: #2f6d3b;
    border: 0;
    color: #fff;
    cursor: pointer;
    font-weight: 800;
    padding: 0 1rem;
  }

  button:disabled {
    cursor: wait;
    opacity: 0.65;
  }

  @media (max-width: 760px) {
    input,
    button {
      min-height: 2.45rem;
    }
  }
</style>
