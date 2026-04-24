<script lang="ts">
  import BudgetSummary from "$lib/components/BudgetSummary.svelte";
  import DailyBudgetTable from "$lib/components/DailyBudgetTable.svelte";
  import DayEntryModal from "$lib/components/DayEntryModal.svelte";
  import PeriodCalendar from "$lib/components/PeriodCalendar.svelte";
  import PeriodRangePicker from "$lib/components/PeriodRangePicker.svelte";
  import type { PageData } from "./$types";

  export let data: PageData;

  type PeriodSummary = NonNullable<PageData["summary"]>;
  type PeriodOption = PageData["periods"][number];
  type DailyRow = PeriodSummary["dailyRows"][number];
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

  let periods: PeriodOption[] = data.periods ?? [];
  let selectedPeriodId: string | null = data.selectedPeriodId;
  let summary: PeriodSummary | null = data.summary;
  let summaryLoading = false;
  let summaryError: string | null = null;

  let periodSaving = false;
  let periodError: string | null = null;
  let rangeStartDate = summary?.startDate ?? data.today;
  let rangeEndDate = summary?.endDate ?? addDays(data.today, 29);
  let createStartDate = periods.length > 0 ? addDays(periods[periods.length - 1].endDate, 1) : data.today;
  let createEndDate = addDays(createStartDate, 29);
  let createPeriodId = toPeriodId(createStartDate);
  let createBudgetInput = "120000";

  let modalOpen = false;
  let modalSaving = false;
  let modalError: string | null = null;
  let selectedDate: string | null = null;
  let selectedRow: DailyRow | null = null;
  let historyLoading = false;
  let historyError: string | null = null;
  let histories: HistoryItem[] = [];
  let modalInputYen = "";
  let modalMemo = "";
  let modalOperation: "add" | "overwrite" = "add";

  $: modalPreviewAfterYen =
    modalOperation === "add"
      ? (selectedRow?.usedYen ?? 0) + (Number.parseInt(modalInputYen || "0", 10) || 0)
      : Number.parseInt(modalInputYen || "0", 10) || 0;
  $: modalRemainingRows =
    summary == null || selectedDate == null
      ? 0
      : summary.dailyRows.filter((row) => row.date >= (selectedDate ?? "")).length;
  $: modalPreviewRemainingYen =
    summary == null ? null : summary.remainingYen + (selectedRow?.usedYen ?? 0) - modalPreviewAfterYen;
  $: modalPreviewRecommendedYen =
    modalPreviewRemainingYen == null || modalRemainingRows === 0
      ? null
      : Math.max(0, Math.floor(modalPreviewRemainingYen / modalRemainingRows));

  $: if (summary) {
    selectedPeriodId = summary.periodId;
    rangeStartDate = summary.startDate;
    rangeEndDate = summary.endDate;
  }

  function addDays(date: string, days: number): string {
    const current = Date.parse(`${date}T00:00:00.000Z`);
    return new Date(current + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }

  function toPeriodId(startDate: string): string {
    return `p-${startDate}`;
  }

  async function parseApiError(response: Response): Promise<string> {
    const body = await response.json().catch(() => ({}));
    return body?.error?.message ?? "保存に失敗しました。";
  }

  async function refreshPeriodList(preferredPeriodId?: string): Promise<void> {
    const response = await fetch("/api/periods");
    if (!response.ok) {
      throw new Error(await parseApiError(response));
    }
    const body = await response.json();
    periods = body.periods ?? [];
    if (periods.length === 0) {
      selectedPeriodId = null;
      summary = null;
      return;
    }
    const matched =
      periods.find((period) => period.id === preferredPeriodId) ??
      periods.find((period) => period.id === selectedPeriodId) ??
      periods[periods.length - 1];
    selectedPeriodId = matched.id;
    await refreshSummary(matched.id);
  }

  async function refreshSummary(periodId: string): Promise<void> {
    summaryLoading = true;
    summaryError = null;
    try {
      const response = await fetch(`/api/periods/${encodeURIComponent(periodId)}`);
      if (!response.ok) {
        summaryError = await parseApiError(response);
        return;
      }
      summary = await response.json();
    } catch {
      summaryError = "再取得に失敗しました。";
    } finally {
      summaryLoading = false;
    }
  }

  async function loadHistory(date: string): Promise<void> {
    if (!selectedPeriodId) {
      return;
    }
    historyLoading = true;
    historyError = null;
    try {
      const response = await fetch(
        `/api/periods/${encodeURIComponent(selectedPeriodId)}/days/${encodeURIComponent(date)}/history`
      );
      if (!response.ok) {
        historyError = await parseApiError(response);
        return;
      }
      const body = await response.json();
      histories = body.histories ?? [];
    } catch {
      historyError = "履歴の取得に失敗しました。";
    } finally {
      historyLoading = false;
    }
  }

  async function savePeriodUpdate(payload: {
    budgetYen: number;
    startDate: string;
    endDate: string;
  }): Promise<void> {
    if (!selectedPeriodId || summaryLoading) {
      return;
    }

    periodSaving = true;
    periodError = null;
    try {
      const response = await fetch(`/api/periods/${encodeURIComponent(selectedPeriodId)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        periodError = await parseApiError(response);
        return;
      }
      const updatedSummary = (await response.json()) as PeriodSummary;
      summary = updatedSummary;
      await refreshPeriodList(updatedSummary.periodId);
    } catch {
      periodError = "保存に失敗しました。";
    } finally {
      periodSaving = false;
    }
  }

  async function handleSavePeriod(event: CustomEvent<{ budgetYen: number }>): Promise<void> {
    if (!summary) {
      return;
    }
    await savePeriodUpdate({
      budgetYen: event.detail.budgetYen,
      startDate: rangeStartDate,
      endDate: rangeEndDate
    });
  }

  async function handleRangeChange(event: CustomEvent<{ startDate: string; endDate: string }>): Promise<void> {
    rangeStartDate = event.detail.startDate;
    rangeEndDate = event.detail.endDate;
    if (!summary) {
      return;
    }
    await savePeriodUpdate({
      budgetYen: summary.budgetYen,
      startDate: event.detail.startDate,
      endDate: event.detail.endDate
    });
  }

  async function handleSelectPeriod(event: CustomEvent<{ periodId: string }>): Promise<void> {
    await refreshSummary(event.detail.periodId);
  }

  async function createInitialPeriod(): Promise<void> {
    const budgetYen = Number.parseInt(createBudgetInput, 10);
    if (!Number.isInteger(budgetYen) || budgetYen < 0) {
      periodError = "予算は 0 以上の整数で入力してください。";
      return;
    }

    periodSaving = true;
    periodError = null;
    try {
      const latestPeriod = periods[periods.length - 1] ?? null;
      const predecessorPeriodId =
        latestPeriod && addDays(latestPeriod.endDate, 1) === createStartDate
          ? latestPeriod.id
          : null;
      const response = await fetch("/api/periods", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: createPeriodId,
          startDate: createStartDate,
          endDate: createEndDate,
          budgetYen,
          predecessorPeriodId
        })
      });
      if (!response.ok) {
        periodError = await parseApiError(response);
        return;
      }
      const created = await response.json();
      await refreshPeriodList(created.id);
    } catch {
      periodError = "期間作成に失敗しました。";
    } finally {
      periodSaving = false;
    }
  }

  function openDayEntry(payload: { date: string }): void {
    if (!summary) {
      return;
    }
    selectedDate = payload.date;
    selectedRow = summary.dailyRows.find((row) => row.date === selectedDate) ?? null;
    modalError = null;
    modalOpen = true;
    modalInputYen = "";
    modalMemo = "";
    modalOperation = "add";
    histories = [];
    void loadHistory(payload.date);
  }

  function closeDayEntry(): void {
    modalOpen = false;
    modalError = null;
  }

  async function submitDayEntry(
    event: CustomEvent<{ date: string; inputYen: number; operation: "add" | "overwrite"; memo: string }>
  ): Promise<void> {
    if (!selectedPeriodId) {
      return;
    }

    modalSaving = true;
    modalError = null;
    try {
      const endpoint =
        event.detail.operation === "add"
          ? `/api/periods/${encodeURIComponent(selectedPeriodId)}/days/${encodeURIComponent(event.detail.date)}/add`
          : `/api/periods/${encodeURIComponent(selectedPeriodId)}/days/${encodeURIComponent(event.detail.date)}/overwrite`;
      const method = event.detail.operation === "add" ? "POST" : "PUT";
      const response = await fetch(endpoint, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          inputYen: event.detail.inputYen,
          memo: event.detail.memo
        })
      });
      if (!response.ok) {
        modalError = await parseApiError(response);
        return;
      }
      const updatedSummary = (await response.json()) as PeriodSummary;
      summary = updatedSummary;
      if (selectedDate) {
        selectedRow = updatedSummary.dailyRows.find((row) => row.date === selectedDate) ?? null;
        await loadHistory(selectedDate);
      }
      closeDayEntry();
    } catch {
      modalError = "保存に失敗しました。";
    } finally {
      modalSaving = false;
    }
  }
</script>

<main>
  {#if periods.length > 0 && summary}
    <section class="workspace-shell">
      <BudgetSummary
        {summary}
        {periods}
        {selectedPeriodId}
        saving={periodSaving}
        loading={summaryLoading}
        errorMessage={periodError}
        on:savePeriod={handleSavePeriod}
        on:selectPeriod={handleSelectPeriod}
      />

      <section class="primary-workspace" aria-label="日別入力">
        <div class="workspace-heading">
          <div>
            <p class="eyebrow">Step 1</p>
            <h2>カレンダーの日付を選んで入力</h2>
            <p>日付を押すと、その日の入力と履歴をまとめて確認できます。</p>
          </div>
          {#if summaryLoading}
            <p class="loading-pill">読み込み中...</p>
          {/if}
        </div>

        {#if summaryError}
          <p role="alert">{summaryError}</p>
        {/if}

        <PeriodCalendar
          rows={summary.dailyRows}
          startDate={summary.startDate}
          endDate={summary.endDate}
          loading={summaryLoading}
          on:request-edit={(event) => openDayEntry(event.detail)}
        />
      </section>

      <section class="secondary-actions" aria-label="期間設定">
        <details>
          <summary>期間の終了日や予算を変更する</summary>
          <div class="details-body">
            <PeriodRangePicker
              startDate={rangeStartDate}
              endDate={rangeEndDate}
              saving={periodSaving}
              testIdPrefix="current-period-range"
              on:change={handleRangeChange}
            />
          </div>
        </details>

        <details data-testid="create-period-panel">
          <summary>次の予算期間を作成する</summary>
          <div class="details-body">
            <p>今の期間が終わった後の期間を追加します。開始日は前期間の翌日が基本です。</p>
            <label>
              期間ID
              <input
                aria-label="期間ID"
                type="text"
                bind:value={createPeriodId}
                placeholder="p-2026-04-20"
              />
            </label>
            <PeriodRangePicker
              startDate={createStartDate}
              endDate={createEndDate}
              saving={periodSaving}
              testIdPrefix="create-period-range"
              on:change={(event) => {
                createStartDate = event.detail.startDate;
                createEndDate = event.detail.endDate;
                createPeriodId = toPeriodId(event.detail.startDate);
              }}
            />
            <label>
              新規予算額 (円)
              <input aria-label="新規予算額 (円)" type="number" min="0" bind:value={createBudgetInput} />
            </label>
            <button type="button" on:click={createInitialPeriod} disabled={periodSaving}>
              {periodSaving ? "作成中..." : "期間を作成"}
            </button>
          </div>
        </details>
      </section>
    </section>
  {:else}
    <section class="empty-state" data-testid="create-period-panel">
      <p class="eyebrow">Step 1</p>
      <h1>最初の予算期間を作成</h1>
      <p>まずは使う期間と総予算を決めます。作成後はカレンダーの日付を押して支出を入力できます。</p>
      {#if periodError}
        <p role="alert">{periodError}</p>
      {/if}
      <label>
        期間ID
        <input
          aria-label="期間ID"
          type="text"
          bind:value={createPeriodId}
          placeholder="p-2026-04-20"
        />
      </label>
      <PeriodRangePicker
        startDate={createStartDate}
        endDate={createEndDate}
        saving={periodSaving}
        testIdPrefix="initial-period-range"
        on:change={(event) => {
          createStartDate = event.detail.startDate;
          createEndDate = event.detail.endDate;
          createPeriodId = toPeriodId(event.detail.startDate);
        }}
      />
      <label>
        新規予算額 (円)
        <input aria-label="新規予算額 (円)" type="number" min="0" bind:value={createBudgetInput} />
      </label>
      <button type="button" on:click={createInitialPeriod} disabled={periodSaving}>
        {periodSaving ? "作成中..." : "期間を作成"}
      </button>
    </section>
  {/if}

  <DayEntryModal
    isOpen={modalOpen}
    date={selectedDate}
    currentUsedYen={selectedRow?.usedYen ?? 0}
    isPlanned={selectedRow?.label === "planned"}
    saving={modalSaving}
    errorMessage={modalError}
    historyErrorMessage={historyError}
    historyLoading={historyLoading}
    {histories}
    bind:inputYen={modalInputYen}
    bind:memo={modalMemo}
    bind:operation={modalOperation}
    previewAfterYen={modalPreviewAfterYen}
    previewRemainingYen={modalPreviewRemainingYen}
    previewRecommendedYen={modalPreviewRecommendedYen}
    on:close={closeDayEntry}
    on:save={submitDayEntry}
  />
</main>

<style>
  :global(body) {
    background: #f6f3ec;
    color: #201b16;
    font-family: "Noto Sans JP", "Hiragino Sans", sans-serif;
    margin: 0;
  }

  main {
    margin: 0 auto;
    max-width: 1180px;
    padding: 2rem;
  }

  .workspace-shell {
    display: grid;
    gap: 1.25rem;
  }

  .primary-workspace,
  .empty-state,
  .secondary-actions details {
    background: #fffaf1;
    border: 1px solid #e2d7c4;
    border-radius: 24px;
    box-shadow: 0 18px 50px rgba(42, 31, 18, 0.08);
    padding: 1.25rem;
  }

  .workspace-heading {
    align-items: flex-start;
    display: flex;
    gap: 1rem;
    justify-content: space-between;
    margin-bottom: 1rem;
  }

  .workspace-heading h2,
  .empty-state h1 {
    font-size: clamp(1.5rem, 3vw, 2.25rem);
    letter-spacing: -0.04em;
    line-height: 1.1;
    margin: 0.2rem 0;
  }

  .workspace-heading p,
  .empty-state p {
    color: #65584a;
    margin: 0;
  }

  .eyebrow {
    color: #a45f23;
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .loading-pill {
    background: #2d5b45;
    border-radius: 999px;
    color: #fff;
    font-size: 0.85rem;
    padding: 0.45rem 0.75rem;
    white-space: nowrap;
  }

  .secondary-actions {
    display: grid;
    gap: 0.75rem;
  }

  details summary {
    cursor: pointer;
    font-weight: 800;
    list-style: none;
  }

  details summary::-webkit-details-marker {
    display: none;
  }

  details summary::after {
    color: #a45f23;
    content: "開く";
    float: right;
    font-size: 0.85rem;
  }

  details[open] summary::after {
    content: "閉じる";
  }

  .details-body {
    border-top: 1px solid #e2d7c4;
    margin-top: 1rem;
    padding-top: 1rem;
  }

  label {
    display: grid;
    font-weight: 700;
    gap: 0.35rem;
    margin: 0.75rem 0;
  }

  input,
  button {
    border-radius: 12px;
    font: inherit;
    min-height: 2.5rem;
  }

  input {
    background: #fff;
    border: 1px solid #d7c9b3;
    padding: 0 0.75rem;
  }

  button {
    background: #263f33;
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
</style>
