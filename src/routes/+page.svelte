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

    <PeriodRangePicker
      startDate={rangeStartDate}
      endDate={rangeEndDate}
      saving={periodSaving}
      on:change={handleRangeChange}
    />

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

    <DailyBudgetTable
      rows={summary.dailyRows}
      loading={summaryLoading}
      on:request-edit={(event) => openDayEntry(event.detail)}
    />

    <section data-testid="create-period-panel">
      <h2>新しい予算期間を作成</h2>
      <p>期間ID</p>
      <input
        aria-label="期間ID"
        type="text"
        bind:value={createPeriodId}
        placeholder="p-2026-04-20"
      />
      <PeriodRangePicker
        startDate={createStartDate}
        endDate={createEndDate}
        saving={periodSaving}
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
  {:else}
    <section data-testid="create-period-panel">
      <h1>最初の予算期間を作成</h1>
      {#if periodError}
        <p role="alert">{periodError}</p>
      {/if}
      <p>期間ID</p>
      <input
        aria-label="期間ID"
        type="text"
        bind:value={createPeriodId}
        placeholder="p-2026-04-20"
      />
      <PeriodRangePicker
        startDate={createStartDate}
        endDate={createEndDate}
        saving={periodSaving}
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
