<script lang="ts">
  import { CircleDollarSign, PencilLine, Wallet } from "@lucide/svelte";

  type Props = {
    currentUsedYen?: number;
    previewAfterYen?: number;
    previewRemainingYen?: number | null;
    previewRecommendedYen?: number | null;
  };

  let {
    currentUsedYen = 0,
    previewAfterYen = 0,
    previewRemainingYen = null,
    previewRecommendedYen = null,
  }: Props = $props();

  function formatYen(value: number): string {
    return value.toLocaleString("ja-JP");
  }
</script>

<div class="summary-grid" aria-label="入力前後の試算">
  <div class="summary-item">
    <span class="summary-icon warm" aria-hidden="true">
      <Wallet size={20} strokeWidth={2.4} />
    </span>
    <span class="summary-label">変更前</span>
    <strong>{formatYen(currentUsedYen)} 円</strong>
    <small>入力済みの金額</small>
  </div>
  <div class="summary-item">
    <span class="summary-icon green" aria-hidden="true">
      <PencilLine size={20} strokeWidth={2.4} />
    </span>
    <span class="summary-label">変更後</span>
    <strong>{formatYen(previewAfterYen)} 円</strong>
    <small>この操作後の金額</small>
  </div>
  {#if previewRemainingYen != null}
    <div class="summary-item">
      <span class="summary-icon green" aria-hidden="true">
        <CircleDollarSign size={20} strokeWidth={2.4} />
      </span>
      <span class="summary-label">期間残額</span>
      <strong>{formatYen(previewRemainingYen)} 円</strong>
      <small>操作後の残り予算</small>
    </div>
  {/if}
</div>

{#if previewRecommendedYen != null}
  <div class="recommendation-strip">
    <strong>推奨予算</strong>
    <span>1日あたり {formatYen(previewRecommendedYen)} 円</span>
  </div>
{/if}

<style>
  .summary-grid {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .summary-item {
    align-items: start;
    border: 1px solid #e7ddd0;
    border-radius: 10px;
    display: grid;
    gap: 0.2rem;
    grid-template-columns: auto minmax(0, 1fr);
    padding: 0.85rem;
  }

  .summary-icon {
    align-items: center;
    border-radius: 999px;
    display: inline-flex;
    flex: 0 0 auto;
    grid-row: 1 / 4;
    height: 2.3rem;
    justify-content: center;
    width: 2.3rem;
  }

  .summary-icon.warm {
    background: #f7ead4;
    color: #bd7416;
  }

  .summary-icon.green {
    background: #e3f0df;
    color: #397d3d;
  }

  .summary-label,
  small {
    color: #76675b;
    font-size: 0.78rem;
    font-weight: 800;
  }

  .summary-item strong {
    color: #2f2219;
    font-size: 1.45rem;
    line-height: 1.1;
  }

  .summary-item:nth-child(n + 2) strong {
    color: #397d3d;
  }

  .recommendation-strip {
    align-items: center;
    background: #fffaf0;
    border: 1px solid #eadcc9;
    border-radius: 10px;
    color: #3a2a20;
    display: flex;
    gap: 0.75rem;
    justify-content: space-between;
    padding: 0.85rem 1rem;
  }

  .recommendation-strip strong {
    color: #8a5a16;
  }

  @media (max-width: 900px) {
    .summary-grid {
      grid-template-columns: 1fr;
      gap: 0.6rem;
    }
  }

  @media (max-width: 760px) {
    .summary-item {
      grid-template-columns: auto minmax(0, 1fr);
      padding: 0.75rem;
    }
  }
</style>
