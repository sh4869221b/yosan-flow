<script lang="ts">
  import BudgetSummary from "$lib/components/BudgetSummary.svelte";
  import DailyBudgetTable from "$lib/components/DailyBudgetTable.svelte";
  import DayEntryModal from "$lib/components/DayEntryModal.svelte";
  import HistoryPanel from "$lib/components/HistoryPanel.svelte";
  import type { PageData } from "./$types";

  export let data: PageData;

  type MonthSummary = PageData["summary"];
  type DailyRow = MonthSummary["dailyRows"][number];
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

  let summary: MonthSummary = data.summary;
  let summaryLoading = false;
  let summaryError: string | null = null;
  let budgetSaving = false;
  let budgetError: string | null = null;
  let modalOpen = false;
  let modalSaving = false;
  let modalError: string | null = null;
  let selectedDate: string | null = null;
  let selectedRow: DailyRow | null = null;
  let historyLoading = false;
  let historyError: string | null = null;
  let histories: HistoryItem[] = [];

  async function parseApiError(response: Response): Promise<string> {
    const body = await response.json().catch(() => ({}));
    return body?.error?.message ?? "保存に失敗しました。";
  }

  async function refreshSummary(): Promise<void> {
    summaryLoading = true;
    summaryError = null;
    try {
      const response = await fetch(`/api/months/${summary.yearMonth}`);
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
    historyLoading = true;
    historyError = null;
    try {
      const response = await fetch(`/api/days/${date}/history`);
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

  async function handleSaveBudget(event: CustomEvent<{ budgetYen: number }>): Promise<void> {
    budgetSaving = true;
    budgetError = null;
    try {
      const endpoint =
        summary.monthStatus === "uninitialized"
          ? `/api/months/${summary.yearMonth}/initialize`
          : `/api/months/${summary.yearMonth}/budget`;
      const method = summary.monthStatus === "uninitialized" ? "POST" : "PUT";
      const response = await fetch(endpoint, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ budgetYen: event.detail.budgetYen })
      });

      if (!response.ok) {
        budgetError = await parseApiError(response);
        return;
      }

      summary = await response.json();
      await refreshSummary();
    } catch {
      budgetError = "保存に失敗しました。";
    } finally {
      budgetSaving = false;
    }
  }

  async function openDayEntry(event: CustomEvent<{ date: string }>): Promise<void> {
    selectedDate = event.detail.date;
    selectedRow = summary.dailyRows.find((row) => row.date === selectedDate) ?? null;
    modalError = null;
    modalOpen = true;
    histories = [];
    await loadHistory(event.detail.date);
  }

  async function saveDayEntry(
    event: CustomEvent<{ date: string; inputYen: number; operation: "add" | "overwrite"; memo: string }>
  ): Promise<void> {
    modalSaving = true;
    modalError = null;
    try {
      const endpoint =
        event.detail.operation === "add"
          ? `/api/days/${event.detail.date}/add`
          : `/api/days/${event.detail.date}/overwrite`;
      const method = event.detail.operation === "add" ? "POST" : "PUT";
      const response = await fetch(endpoint, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          yearMonth: summary.yearMonth,
          inputYen: event.detail.inputYen,
          memo: event.detail.memo
        })
      });

      if (!response.ok) {
        modalError = await parseApiError(response);
        return;
      }

      summary = await response.json();
      await refreshSummary();
      if (selectedDate) {
        selectedRow = summary.dailyRows.find((row) => row.date === selectedDate) ?? null;
        await loadHistory(selectedDate);
      }
      modalOpen = false;
    } catch {
      modalError = "保存に失敗しました。";
    } finally {
      modalSaving = false;
    }
  }
</script>

<main>
  <BudgetSummary
    {summary}
    saving={budgetSaving}
    errorMessage={budgetError}
    on:saveBudget={handleSaveBudget}
  />

  {#if summaryError}
    <p role="alert">{summaryError}</p>
  {/if}

  <DailyBudgetTable rows={summary.dailyRows} loading={summaryLoading} on:edit={openDayEntry} />

  <DayEntryModal
    open={modalOpen}
    date={selectedDate}
    currentUsedYen={selectedRow?.usedYen ?? 0}
    isPlanned={selectedRow?.label === "planned"}
    saving={modalSaving}
    errorMessage={modalError}
    on:close={() => (modalOpen = false)}
    on:save={saveDayEntry}
  />

  <HistoryPanel
    date={selectedDate}
    {histories}
    loading={historyLoading}
    errorMessage={historyError}
  />
</main>
