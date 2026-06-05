<script lang="ts">
  import { Utensils } from "@lucide/svelte";

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
  };

  let { pace, paceStatusLabel }: Props = $props();

  function formatYen(value: number): string {
    return `${value.toLocaleString("ja-JP")} 円`;
  }
</script>

<div class="today-pace" data-testid="food-pace-panel">
  <p class="allowance-card">
    <span class="food-icon" aria-hidden="true">
      <Utensils size={30} strokeWidth={2.4} />
    </span>
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
  <p>
    <span>残り</span>
    <strong data-testid="today-food-remaining"
      >{formatYen(pace.todayRemainingYen)}</strong
    >
  </p>
</div>

<div class="pace-details" class:with-total={pace.totalAdjustmentYen > 0}>
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
    border: 1px solid #e4ddd2;
    border-radius: 12px;
    grid-template-columns: minmax(16rem, 1.35fr) repeat(2, minmax(9rem, 1fr));
    margin-top: 1rem;
    overflow: hidden;
  }

  .pace-details {
    border-top: 1px solid #e9e1d6;
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
    border-left: 1px solid #e4ddd2;
  }

  .pace-details p + p {
    border-left: 1px solid #e4ddd2;
  }

  .allowance-card {
    background: linear-gradient(90deg, #f3faf2, #fffdf8);
    position: relative;
  }

  .food-icon {
    align-items: center;
    background: #dcefd7;
    border-radius: 999px;
    color: #397d3d;
    display: inline-flex;
    font-size: 0.95rem;
    font-weight: 900;
    height: 3.8rem;
    justify-content: center;
    margin-right: 0.8rem;
    vertical-align: middle;
    width: 3.8rem;
  }

  .today-pace span,
  .pace-details span {
    color: #56483d;
    display: block;
    font-size: 0.86rem;
    font-weight: 800;
  }

  .today-pace strong,
  .pace-details strong {
    display: block;
    font-size: 1.3rem;
    letter-spacing: 0;
    margin-top: 0.2rem;
    white-space: nowrap;
  }

  .today-pace strong {
    color: #3e8445;
    font-size: clamp(2rem, 4.2vw, 3rem);
    line-height: 1.1;
  }

  .today-pace p:nth-child(2) strong {
    color: #3a2a20;
  }

  .today-pace p:nth-child(3) strong,
  .pace-details p:first-child strong {
    color: #3e8445;
  }

  .total-adjustment strong {
    color: #b4473e;
  }

  @media (max-width: 760px) {
    .today-pace {
      border-radius: 14px;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      margin-top: 0.7rem;
    }

    .allowance-card {
      grid-column: 1 / -1;
      text-align: center;
    }

    .today-pace p {
      min-height: 4.15rem;
      padding: 0.75rem;
    }

    .today-pace p + p {
      border-left: 0;
      border-top: 1px solid #e4ddd2;
    }

    .today-pace p:nth-child(3) {
      border-left: 1px solid #e4ddd2;
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

    .food-icon {
      height: 2.75rem;
      width: 2.75rem;
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
