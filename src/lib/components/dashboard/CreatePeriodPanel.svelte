<script lang="ts">
  import { createDashboardPageController } from "$lib/dashboard/page-controller.svelte";
  import PeriodRangePicker from "$lib/components/PeriodRangePicker.svelte";

  type Controller = ReturnType<typeof createDashboardPageController>;

  type Props = {
    variant: "empty-state" | "secondary-action";
    controller: Controller;
  };

  let { variant, controller }: Props = $props();
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
    startDate={controller.createStartDate}
    endDate={controller.createEndDate}
    saving={controller.periodSaving}
    testIdPrefix="initial-period-range"
    change={controller.updateCreatePeriodRange}
  />
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
    disabled={controller.periodSaving}
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
    startDate={controller.createStartDate}
    endDate={controller.createEndDate}
    saving={controller.periodSaving}
    testIdPrefix="create-period-range"
    change={controller.updateCreatePeriodRange}
  />
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
    disabled={controller.periodSaving}
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
