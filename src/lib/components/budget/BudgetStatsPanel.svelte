<script lang="ts">
  import { CalendarDays, JapaneseYen, WalletCards } from "@lucide/svelte";

  type Props = {
    budgetYen: number;
    remainingYen: number;
    daysRemaining: number;
    overspentYen: number;
  };

  let { budgetYen, remainingYen, daysRemaining, overspentYen }: Props =
    $props();

  function formatYen(value: number): string {
    return `${value.toLocaleString("ja-JP")} 円`;
  }
</script>

<div class="stats">
  <p data-testid="budget-value">
    <span class="stat-label">
      <WalletCards size={17} strokeWidth={2.4} aria-hidden="true" />
      期間予算
    </span>
    <strong>{formatYen(budgetYen)}</strong>
  </p>
  <p>
    <span class="stat-label">
      <JapaneseYen size={17} strokeWidth={2.4} aria-hidden="true" />
      期間残額
    </span>
    <strong>{formatYen(remainingYen)}</strong>
  </p>
  <p>
    <span class="stat-label">
      <CalendarDays size={17} strokeWidth={2.4} aria-hidden="true" />
      残り日数
    </span>
    <strong>{daysRemaining} 日</strong>
  </p>
</div>

{#if overspentYen > 0}
  <p role="status">予算を {overspentYen} 円 超過しています。</p>
{/if}

<style>
  .stats {
    display: grid;
    gap: 0;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin: 1rem 0 0;
    padding-top: 0.95rem;
    border-top: 1px solid #e9e1d6;
  }

  .stats p {
    margin: 0;
    padding: 0 1rem;
  }

  .stats p + p {
    border-left: 1px solid #e4ddd2;
  }

  .stats span {
    color: #56483d;
    display: block;
    font-size: 0.86rem;
    font-weight: 800;
  }

  .stats .stat-label {
    align-items: center;
    display: flex;
    gap: 0.35rem;
  }

  .stat-label :global(svg) {
    color: #397d3d;
    flex: 0 0 auto;
  }

  .stats strong {
    display: block;
    font-size: 1.3rem;
    letter-spacing: 0;
    margin-top: 0.2rem;
    white-space: nowrap;
  }

  .stats p:nth-child(2) strong {
    color: #3e8445;
  }

  p[role="status"] {
    color: #8b3a3a;
    font-weight: 700;
    margin-top: 0.5rem;
  }

  @media (max-width: 760px) {
    .stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      margin-top: 0.75rem;
      padding-top: 0.75rem;
      row-gap: 0.7rem;
    }

    .stats p {
      padding: 0 0.55rem;
    }

    .stats p:nth-child(odd) {
      border-left: 0;
    }

    .stats span {
      font-size: 0.78rem;
    }

    .stats strong {
      font-size: 1.05rem;
    }
  }
</style>
