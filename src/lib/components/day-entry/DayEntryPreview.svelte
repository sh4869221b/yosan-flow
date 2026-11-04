<script lang="ts">
  import { parseNonNegativeIntegerYenInput } from "#lib/dashboard/yen-input.ts";
  type Props = {
    inputYen?: string;
    currentUsedYen?: number;
    previewAfterYen?: number;
    previewRemainingYen?: number | null;
    previewRecommendedYen?: number | null;
  };

  let {
    inputYen = "",
    currentUsedYen = 0,
    previewAfterYen = 0,
    previewRemainingYen = null,
    previewRecommendedYen = null,
  }: Props = $props();

  const addedYen = $derived(parseNonNegativeIntegerYenInput(inputYen));

  function formatYen(value: number): string {
    return value.toLocaleString("ja-JP");
  }
</script>

<div class="summary-grid" aria-label="追加前後の日計の試算">
  <div class="summary-item">
    <span class="summary-label">現在の日計</span>
    <strong>{formatYen(currentUsedYen)} 円</strong>
  </div>
  <div class="summary-item">
    <span class="summary-label">追加後の日計</span>
    <strong
      >{addedYen == null ? "—" : `${formatYen(previewAfterYen)} 円`}</strong
    >
  </div>
</div>
{#if addedYen != null}
  <p class="addition-equation">
    現在 {formatYen(currentUsedYen)} 円 ＋ 今回の追加 {formatYen(addedYen)} 円 ＝
    日計 {formatYen(previewAfterYen)} 円
  </p>
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
{:else}
  <p class="addition-equation">
    {inputYen.trim() === ""
      ? "追加する金額を入力すると日計を試算します。"
      : "正しい金額を入力すると日計を試算できます。"}
  </p>
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

  .addition-equation {
    color: var(--muted-foreground);
    font-size: 0.9rem;
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
