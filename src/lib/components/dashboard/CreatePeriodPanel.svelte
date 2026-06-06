<script lang="ts">
  import { CalendarPlus } from "@lucide/svelte";
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
  <section class="empty-state card" data-testid="create-period-panel">
    <span class="heading-icon" aria-hidden="true">
      <CalendarPlus size={25} strokeWidth={2.4} />
    </span>
    <p class="eyebrow">Step 1</p>
    <h1>最初の予算期間を作成</h1>
    <p>
      まずは使う期間と総予算を決めます。作成後はカレンダーの日付を押して支出を入力できます。
    </p>
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
  </section>
{:else}
  <details class="card" data-testid="create-period-panel">
    <summary>
      <CalendarPlus size={20} strokeWidth={2.4} aria-hidden="true" />
      次の予算期間を作成する
    </summary>
    <div class="details-body">
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
    </div>
  </details>
{/if}

<style>
  .card {
    background: #fffdf8;
    border: 1px solid #e4ddd2;
    border-radius: 12px;
    box-shadow: 0 18px 60px rgba(51, 38, 26, 0.07);
    padding: 1.15rem 1.25rem;
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

  .eyebrow {
    color: #357b3d;
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .empty-state h1 {
    color: #2f2219;
    font-size: clamp(1.25rem, 2vw, 1.55rem);
    letter-spacing: 0;
    line-height: 1.1;
    margin: 0;
  }

  .empty-state p {
    color: #76675b;
    margin: 0;
  }

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
