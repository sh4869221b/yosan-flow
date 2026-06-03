<script lang="ts">
  import { ClipboardList } from "@lucide/svelte";
  import DayEntryPreview from "$lib/components/day-entry/DayEntryPreview.svelte";
  import DayEntryForm from "$lib/components/day-entry/DayEntryForm.svelte";
  import HistoryPanel from "$lib/components/HistoryPanel.svelte";

  type HistoryItem = {
    id: string;
    date: string;
    operationType: "add" | "overwrite";
    inputYen: number;
    beforeTotalYen: number;
    afterTotalYen: number;
    memo: string | null;
    createdAt: string;
  };

  type SavePayload = {
    date: string;
    inputYen: number;
    memo: string;
  };

  type UpdateHistoryPayload = {
    historyId: string;
    inputYen: number;
    memo: string;
  };

  type Props = {
    isOpen?: boolean;
    date?: string | null;
    currentUsedYen?: number;
    isPlanned?: boolean;
    saving?: boolean;
    errorMessage?: string | null;
    historyErrorMessage?: string | null;
    historyLoading?: boolean;
    historyMutatingId?: string | null;
    histories?: HistoryItem[];
    inputYen?: string;
    memo?: string;
    previewAfterYen?: number;
    previewRemainingYen?: number | null;
    previewRecommendedYen?: number | null;
    close?: () => void;
    save?: (_payload: SavePayload) => void;
    updateHistory?: (_payload: UpdateHistoryPayload) => void;
    deleteHistory?: (_payload: { historyId: string }) => void;
  };

  let {
    isOpen = false,
    date = null,
    currentUsedYen = 0,
    isPlanned = false,
    saving = false,
    errorMessage = null,
    historyErrorMessage = null,
    historyLoading = false,
    historyMutatingId = null,
    histories = [],
    inputYen = $bindable(""),
    memo = $bindable(""),
    previewAfterYen = 0,
    previewRemainingYen = null,
    previewRecommendedYen = null,
    close = () => {},
    save = () => {},
    updateHistory = () => {},
    deleteHistory = () => {},
  }: Props = $props();
</script>

{#if isOpen}
  <section
    class="day-entry-card"
    aria-label="日次入力モーダル"
    data-testid="day-entry-modal"
  >
    <div class="entry-header">
      <span class="entry-icon" aria-hidden="true">
        <ClipboardList size={24} strokeWidth={2.4} />
      </span>
      <div>
        <p class="eyebrow">Step 2</p>
        <h2>日次入力</h2>
      </div>
      {#if date}
        <p class="target-date">対象日: {date}</p>
      {/if}
    </div>

    {#if isPlanned}
      <p class="planned-note">予定支出として登録されます。</p>
    {/if}

    <DayEntryPreview
      {currentUsedYen}
      {previewAfterYen}
      {previewRemainingYen}
      {previewRecommendedYen}
    />

    {#if errorMessage}
      <p class="error-message" role="alert">{errorMessage}</p>
    {/if}

    <div class="entry-layout">
      <DayEntryForm bind:inputYen bind:memo {saving} {close} {save} {date} />

      <HistoryPanel
        {isOpen}
        {date}
        {histories}
        loading={historyLoading}
        errorMessage={historyErrorMessage}
        {historyMutatingId}
        {updateHistory}
        {deleteHistory}
      />
    </div>
  </section>
{/if}

<style>
  .day-entry-card {
    background: #fffdf8;
    border: 1px solid #e4ddd2;
    border-radius: 12px;
    box-shadow: 0 18px 60px rgba(51, 38, 26, 0.07);
    display: grid;
    gap: 1rem;
    margin-top: 1rem;
    padding: 1.15rem 1.25rem;
  }

  .entry-header {
    align-items: center;
    display: flex;
    gap: 0.9rem;
    min-width: 0;
  }

  .entry-header > div {
    flex: 1 1 auto;
    min-width: 0;
  }

  .entry-icon {
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
    margin: 0;
    text-transform: uppercase;
  }

  h2 {
    color: #2f2219;
    font-size: 1.45rem;
    letter-spacing: 0;
    line-height: 1.1;
    margin: 0;
  }

  .target-date {
    background: #f7f0e7;
    border: 1px solid #e3d6c6;
    border-radius: 999px;
    color: #3a2a20;
    font-weight: 800;
    margin: 0;
    padding: 0.45rem 0.75rem;
    white-space: nowrap;
  }

  .planned-note {
    background: #fff7e8;
    border: 1px solid #ecd6aa;
    border-radius: 10px;
    color: #74501b;
    font-weight: 800;
    margin: 0;
    padding: 0.75rem 0.85rem;
  }

  .error-message {
    background: #fff1f0;
    border: 1px solid #efc3bd;
    border-radius: 10px;
    color: #9b2c22;
    font-weight: 800;
    margin: 0;
    padding: 0.75rem 0.85rem;
  }

  .entry-layout {
    display: grid;
    gap: 1rem;
    grid-template-columns: minmax(0, 1.15fr) minmax(18rem, 0.85fr);
  }

  @media (max-width: 900px) {
    .entry-layout {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 760px) {
    .day-entry-card {
      border-radius: 18px;
      padding: 0.95rem;
    }

    .entry-header {
      align-items: flex-start;
    }

    .target-date {
      border-radius: 10px;
      font-size: 0.86rem;
      margin-left: auto;
      white-space: normal;
    }

    h2 {
      font-size: 1.2rem;
    }
  }
</style>
