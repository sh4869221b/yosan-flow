<script lang="ts">
  import { Settings2 } from "@lucide/svelte";
  import { createDashboardPageController } from "$lib/dashboard/page-controller.svelte";
  import PeriodRangePicker from "$lib/components/PeriodRangePicker.svelte";

  type Controller = ReturnType<typeof createDashboardPageController>;

  type Props = {
    controller: Controller;
  };

  let { controller }: Props = $props();
</script>

<details class="card">
  <summary>
    <Settings2 size={20} strokeWidth={2.4} aria-hidden="true" />
    期間の終了日や予算を変更する
  </summary>
  <div class="details-body">
    <PeriodRangePicker
      startDate={controller.rangeStartDate}
      endDate={controller.rangeEndDate}
      saving={controller.periodSaving}
      testIdPrefix="current-period-range"
      change={controller.handleRangeChange}
    />
  </div>
</details>

<style>
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
