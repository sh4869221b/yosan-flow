<script lang="ts">
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
    <span class="summary-label">変更前</span>
    <strong>{formatYen(currentUsedYen)} 円</strong>
  </div>
  <div class="summary-item">
    <span class="summary-label">変更後</span>
    <strong>{formatYen(previewAfterYen)} 円</strong>
  </div>
</div>

{#if previewRemainingYen != null || previewRecommendedYen != null}
  <details class="preview-details">
    <summary>期間残額・推奨予算を確認</summary>
    {#if previewRemainingYen != null}
      <p>期間残額 <strong>{formatYen(previewRemainingYen)} 円</strong></p>
    {/if}
    {#if previewRecommendedYen != null}
      <p>
        推奨予算 <span>1日あたり {formatYen(previewRecommendedYen)} 円</span>
      </p>
    {/if}
  </details>
{/if}

<style>
  .summary-grid {
    display: grid;
    gap: 0.6rem;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .summary-item {
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    display: grid;
    gap: 0.2rem;
    min-width: 0;
    padding: 0.6rem;
  }

  .summary-label {
    color: var(--muted-foreground);
    font-size: 0.85rem;
    font-weight: 800;
  }

  .summary-item strong {
    color: var(--foreground);
    font-size: 1.15rem;
    overflow-wrap: anywhere;
  }

  .preview-details {
    color: var(--muted-foreground);
    font-size: 0.9rem;
  }

  summary {
    cursor: pointer;
    padding-block: 0.5rem;
  }

  .preview-details p {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    justify-content: space-between;
    overflow-wrap: anywhere;
  }
</style>
