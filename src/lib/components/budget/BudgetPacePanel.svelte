<script lang="ts">
  import type { Snippet } from "svelte";

  type FoodPace = {
    baseDailyYen: number;
    todayAllowanceYen: number;
    usedTodayYen: number;
    todayRemainingYen: number;
    todayBonusYen: number;
    adjustmentYen: number;
    totalAdjustmentYen: number;
  };

  type Props = {
    pace: FoodPace;
    paceStatusLabel: string;
    todayAction?: Snippet;
  };

  let { pace, paceStatusLabel, todayAction }: Props = $props();

  function formatYen(value: number): string {
    return `${value.toLocaleString("ja-JP")} 円`;
  }
</script>

<div
  class="today-pace overflow-hidden rounded-panel border border-border max-[760px]:rounded-xl"
  data-testid="food-pace-panel"
>
  <p class="remaining-card">
    <span>今日あと使える金額</span>
    <strong data-testid="today-food-remaining"
      >{formatYen(pace.todayRemainingYen)}</strong
    >
    {#if todayAction}{@render todayAction()}{/if}
  </p>
  <p class="allowance-card">
    <span>今日の食費枠</span>
    <strong data-testid="today-food-allowance"
      >{formatYen(pace.todayAllowanceYen)}</strong
    >
  </p>
  <p>
    <span>使用済み</span>
    <strong data-testid="today-food-used">{formatYen(pace.usedTodayYen)}</strong
    >
  </p>
</div>

<div
  class="pace-details border-t border-border"
  class:with-total={pace.totalAdjustmentYen > 0}
>
  <p data-testid="food-pace-status">
    <span>状態</span>
    <strong>{paceStatusLabel}</strong>
  </p>
  <p>
    <span>基準</span>
    <strong data-testid="base-daily-food">{formatYen(pace.baseDailyYen)}</strong
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
  {#if pace.totalAdjustmentYen > 0}
    <p class="total-adjustment">
      <span>合計マイナス額</span>
      <strong data-testid="total-negative-adjustment">
        -{formatYen(pace.totalAdjustmentYen)}
      </strong>
    </p>
  {/if}
</div>

<style>
  .today-pace,
  .pace-details {
    display: grid;
    gap: 0;
  }

  .today-pace {
    grid-template-columns: minmax(0, 1.35fr) repeat(2, minmax(0, 1fr));
    margin-top: 1rem;
  }

  .pace-details {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    margin-top: 0.95rem;
    padding-top: 0.95rem;
  }

  .pace-details.with-total {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .today-pace p,
  .pace-details p {
    margin: 0;
    padding: 0 1rem;
  }

  .today-pace p {
    min-height: 7.2rem;
    padding: 1.15rem 1.45rem;
  }

  .today-pace p + p {
    border-left: 1px solid var(--border);
  }

  .pace-details p + p {
    border-left: 1px solid var(--border);
  }

  .remaining-card {
    background: linear-gradient(90deg, #f3faf2, var(--card));
    position: relative;
  }

  .remaining-card :global(button) {
    margin-top: 0.75rem;
    max-width: 100%;
  }

  .today-pace span,
  .pace-details span {
    color: var(--muted-foreground);
    display: block;
    font-size: 0.86rem;
    font-weight: 800;
  }

  .today-pace strong,
  .pace-details strong {
    display: block;
    font-size: 1.3rem;
    font-weight: 700;
    letter-spacing: 0;
    margin-top: 0.2rem;
    overflow-wrap: anywhere;
  }

  .today-pace strong {
    color: var(--budget-positive);
    font-size: clamp(2rem, 4.2vw, 3rem);
    line-height: 1.1;
  }

  .today-pace p:last-child strong {
    color: var(--budget-used);
  }

  .remaining-card strong,
  .pace-details p:first-child strong {
    color: var(--budget-positive);
  }

  .total-adjustment strong {
    color: var(--budget-negative);
  }

  @media (max-width: 760px) {
    .today-pace {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      margin-top: 0.7rem;
    }

    .remaining-card {
      grid-column: 1 / -1;
      text-align: center;
    }

    .today-pace p {
      min-height: 4.15rem;
      padding: 0.75rem;
    }

    .today-pace p + p {
      border-left: 0;
      border-top: 1px solid var(--border);
    }

    .today-pace p:last-child {
      border-left: 1px solid var(--border);
    }

    .pace-details {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      margin-top: 0.75rem;
      padding-top: 0.75rem;
      row-gap: 0.7rem;
    }

    .pace-details.with-total {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .pace-details p {
      padding: 0 0.55rem;
    }

    .pace-details p:nth-child(odd) {
      border-left: 0;
    }

    .total-adjustment {
      border-left: 0;
      grid-column: 1 / -1;
    }

    .today-pace span,
    .pace-details span {
      font-size: 0.78rem;
    }

    .today-pace strong {
      font-size: 1.8rem;
    }

    .pace-details strong {
      font-size: 1.05rem;
    }
  }
</style>
