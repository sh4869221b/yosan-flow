import { Effect } from "effect";
import {
  dayAddUrl,
  dayHistoryUrl,
  fetchJsonEffect,
  historyItemUrl,
  periodSummaryUrl,
  periodsUrl,
  runClientEffect,
} from "$lib/dashboard/api";
import { addDays, toPeriodId } from "$lib/dashboard/date";
import type {
  DeleteHistoryPayload,
  HistoryItem,
  HistoryMutationResponse,
  HistoryResponse,
  PeriodCreateResponse,
  PeriodListResponse,
  SavePeriodPayload,
  SubmitDayEntryPayload,
  UpdateHistoryPayload,
} from "$lib/dashboard/types";
import type { PageData } from "../../routes/$types";

type PeriodSummary = NonNullable<PageData["summary"]>;
type PeriodOption = PageData["periods"][number];
type DailyRow = PeriodSummary["dailyRows"][number];

function getInitialPageState(data: PageData): {
  periods: PeriodOption[];
  selectedPeriodId: string | null;
  summary: PeriodSummary | null;
  today: string;
  createStartDate: string;
} {
  const initialPeriods = data.periods ?? [];
  const today = data.today;
  return {
    periods: initialPeriods,
    selectedPeriodId: data.selectedPeriodId,
    summary: data.summary,
    today,
    createStartDate:
      initialPeriods.length > 0
        ? addDays(initialPeriods[initialPeriods.length - 1].endDate, 1)
        : today,
  };
}

export function createDashboardPageController(data: PageData) {
  const initialPageState = getInitialPageState(data);

  let periods = $state<PeriodOption[]>(initialPageState.periods);
  let selectedPeriodId = $state<string | null>(
    initialPageState.selectedPeriodId,
  );
  let summary = $state<PeriodSummary | null>(initialPageState.summary);
  let summaryLoading = $state(false);
  let summaryError = $state<string | null>(null);

  let periodSaving = $state(false);
  let periodError = $state<string | null>(null);
  let rangeStartDate = $state(
    initialPageState.summary?.startDate ?? initialPageState.today,
  );
  let rangeEndDate = $state(
    initialPageState.summary?.endDate ?? addDays(initialPageState.today, 29),
  );
  let createStartDate = $state(initialPageState.createStartDate);
  let createEndDate = $state(addDays(initialPageState.createStartDate, 29));
  let createPeriodId = $state(toPeriodId(initialPageState.createStartDate));
  let createBudgetInput = $state("120000");

  let modalOpen = $state(false);
  let modalSaving = $state(false);
  let modalError = $state<string | null>(null);
  let selectedDate = $state<string | null>(null);
  let selectedRow = $state<DailyRow | null>(null);
  let historyLoading = $state(false);
  let historyError = $state<string | null>(null);
  let historyMutatingId = $state<string | null>(null);
  let histories = $state<HistoryItem[]>([]);
  let modalInputYen = $state("");
  let modalMemo = $state("");

  const modalPreviewAfterYen = $derived(
    (selectedRow?.usedYen ?? 0) +
      (Number.parseInt(modalInputYen || "0", 10) || 0),
  );
  const modalRemainingRows = $derived(
    summary == null || selectedDate == null
      ? 0
      : summary.dailyRows.filter((row) => row.date >= (selectedDate ?? ""))
          .length,
  );
  const modalPreviewRemainingYen = $derived(
    summary == null
      ? null
      : summary.remainingYen +
          (selectedRow?.usedYen ?? 0) -
          modalPreviewAfterYen,
  );
  const modalPreviewRecommendedYen = $derived(
    modalPreviewRemainingYen == null || modalRemainingRows === 0
      ? null
      : Math.max(0, Math.floor(modalPreviewRemainingYen / modalRemainingRows)),
  );

  $effect(() => {
    if (!summary) {
      return;
    }
    selectedPeriodId = summary.periodId;
    rangeStartDate = summary.startDate;
    rangeEndDate = summary.endDate;
  });

  function refreshSummaryEffect(periodId: string): Effect.Effect<void, never> {
    return Effect.gen(function* () {
      summaryLoading = true;
      summaryError = null;
      const result = yield* fetchJsonEffect<PeriodSummary>(
        periodSummaryUrl(periodId),
        undefined,
        "再取得に失敗しました。",
      ).pipe(Effect.either);
      if (result._tag === "Left") {
        summaryError = result.left;
      } else {
        summary = result.right;
      }
      summaryLoading = false;
    });
  }

  function refreshPeriodListEffect(
    preferredPeriodId?: string,
  ): Effect.Effect<void, string> {
    return Effect.gen(function* () {
      const body = yield* fetchJsonEffect<PeriodListResponse<PeriodOption>>(
        periodsUrl(),
        undefined,
        "保存に失敗しました。",
      );
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
      yield* refreshSummaryEffect(matched.id);
    });
  }

  function loadHistoryEffect(date: string): Effect.Effect<void, never> {
    if (!selectedPeriodId) {
      return Effect.void;
    }
    const periodId = selectedPeriodId;
    return Effect.gen(function* () {
      historyLoading = true;
      historyError = null;
      const result = yield* fetchJsonEffect<HistoryResponse>(
        dayHistoryUrl(periodId, date),
        undefined,
        "履歴の取得に失敗しました。",
      ).pipe(Effect.either);
      if (result._tag === "Left") {
        historyError = result.left;
      } else {
        histories = result.right.histories ?? [];
      }
      historyLoading = false;
    });
  }

  function savePeriodUpdateEffect(
    payload: SavePeriodPayload,
  ): Effect.Effect<void, never> {
    if (!selectedPeriodId || summaryLoading) {
      return Effect.void;
    }
    const periodId = selectedPeriodId;
    return Effect.gen(function* () {
      periodSaving = true;
      periodError = null;
      const result = yield* fetchJsonEffect<PeriodSummary>(
        periodSummaryUrl(periodId),
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
        "保存に失敗しました。",
      ).pipe(Effect.either);
      if (result._tag === "Left") {
        periodError = result.left;
      } else {
        summary = result.right;
        const refreshResult = yield* refreshPeriodListEffect(
          result.right.periodId,
        ).pipe(Effect.either);
        if (refreshResult._tag === "Left") {
          periodError = refreshResult.left;
        }
      }
      periodSaving = false;
    });
  }

  function createInitialPeriodEffect(): Effect.Effect<void, never> {
    const budgetYen = Number.parseInt(createBudgetInput, 10);
    if (!Number.isInteger(budgetYen) || budgetYen < 0) {
      periodError = "予算は 0 以上の整数で入力してください。";
      return Effect.void;
    }
    return Effect.gen(function* () {
      periodSaving = true;
      periodError = null;
      const latestPeriod = periods[periods.length - 1] ?? null;
      const predecessorPeriodId =
        latestPeriod && addDays(latestPeriod.endDate, 1) === createStartDate
          ? latestPeriod.id
          : null;
      const result = yield* fetchJsonEffect<PeriodCreateResponse>(
        periodsUrl(),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: createPeriodId,
            startDate: createStartDate,
            endDate: createEndDate,
            budgetYen,
            predecessorPeriodId,
          }),
        },
        "期間作成に失敗しました。",
      ).pipe(Effect.either);
      if (result._tag === "Left") {
        periodError = result.left;
      } else {
        const refreshResult = yield* refreshPeriodListEffect(
          result.right.id,
        ).pipe(Effect.either);
        if (refreshResult._tag === "Left") {
          periodError = refreshResult.left;
        }
      }
      periodSaving = false;
    });
  }

  function submitDayEntryEffect(
    payload: SubmitDayEntryPayload,
  ): Effect.Effect<void, never> {
    if (!selectedPeriodId) {
      return Effect.void;
    }
    const periodId = selectedPeriodId;
    return Effect.gen(function* () {
      modalSaving = true;
      modalError = null;
      const result = yield* fetchJsonEffect<PeriodSummary>(
        dayAddUrl(periodId, payload.date),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            inputYen: payload.inputYen,
            memo: payload.memo,
          }),
        },
        "保存に失敗しました。",
      ).pipe(Effect.either);
      if (result._tag === "Left") {
        modalError = result.left;
      } else {
        summary = result.right;
        if (selectedDate) {
          selectedRow =
            result.right.dailyRows.find((row) => row.date === selectedDate) ??
            null;
          yield* loadHistoryEffect(selectedDate);
        }
        closeDayEntry();
      }
      modalSaving = false;
    });
  }

  function applyHistoryMutationResult(
    body: HistoryMutationResponse<PeriodSummary>,
  ): void {
    summary = body.summary;
    histories = body.histories;
    if (selectedDate) {
      selectedRow =
        body.summary.dailyRows.find((row) => row.date === selectedDate) ?? null;
    }
  }

  function updateHistoryEffect(
    payload: UpdateHistoryPayload,
  ): Effect.Effect<void, never> {
    if (!selectedPeriodId || !selectedDate) {
      return Effect.void;
    }
    const periodId = selectedPeriodId;
    const date = selectedDate;
    return Effect.gen(function* () {
      historyMutatingId = payload.historyId;
      historyError = null;
      const result = yield* fetchJsonEffect<
        HistoryMutationResponse<PeriodSummary>
      >(
        historyItemUrl(periodId, date, payload.historyId),
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            inputYen: payload.inputYen,
            memo: payload.memo,
          }),
        },
        "履歴の更新に失敗しました。",
      ).pipe(Effect.either);
      if (result._tag === "Left") {
        historyError = result.left;
      } else {
        applyHistoryMutationResult(result.right);
      }
      historyMutatingId = null;
    });
  }

  function deleteHistoryEffect(
    payload: DeleteHistoryPayload,
  ): Effect.Effect<void, never> {
    if (!selectedPeriodId || !selectedDate) {
      return Effect.void;
    }
    const periodId = selectedPeriodId;
    const date = selectedDate;
    return Effect.gen(function* () {
      historyMutatingId = payload.historyId;
      historyError = null;
      const result = yield* fetchJsonEffect<
        HistoryMutationResponse<PeriodSummary>
      >(
        historyItemUrl(periodId, date, payload.historyId),
        { method: "DELETE" },
        "履歴の削除に失敗しました。",
      ).pipe(Effect.either);
      if (result._tag === "Left") {
        historyError = result.left;
      } else {
        applyHistoryMutationResult(result.right);
      }
      historyMutatingId = null;
    });
  }

  function handleSavePeriod(payload: { budgetYen: number }): void {
    if (!summary) {
      return;
    }
    runClientEffect(
      savePeriodUpdateEffect({
        budgetYen: payload.budgetYen,
        startDate: rangeStartDate,
        endDate: rangeEndDate,
      }),
    );
  }

  function handleRangeChange(payload: {
    startDate: string;
    endDate: string;
  }): void {
    rangeStartDate = payload.startDate;
    rangeEndDate = payload.endDate;
    if (!summary) {
      return;
    }
    runClientEffect(
      savePeriodUpdateEffect({
        budgetYen: summary.budgetYen,
        startDate: payload.startDate,
        endDate: payload.endDate,
      }),
    );
  }

  function handleSelectPeriod(payload: { periodId: string }): void {
    runClientEffect(refreshSummaryEffect(payload.periodId));
  }

  function createInitialPeriod(): void {
    runClientEffect(createInitialPeriodEffect());
  }

  function openDayEntry(payload: { date: string }): void {
    if (!summary) {
      return;
    }
    selectedDate = payload.date;
    selectedRow =
      summary.dailyRows.find((row) => row.date === selectedDate) ?? null;
    modalError = null;
    modalOpen = true;
    modalInputYen = "";
    modalMemo = "";
    histories = [];
    runClientEffect(loadHistoryEffect(payload.date));
  }

  function closeDayEntry(): void {
    modalOpen = false;
    modalError = null;
  }

  function submitDayEntry(payload: {
    date: string;
    inputYen: number;
    memo: string;
  }): void {
    runClientEffect(submitDayEntryEffect(payload));
  }

  function updateHistory(payload: {
    historyId: string;
    inputYen: number;
    memo: string;
  }): void {
    runClientEffect(updateHistoryEffect(payload));
  }

  function deleteHistory(payload: { historyId: string }): void {
    runClientEffect(deleteHistoryEffect(payload));
  }

  function updateCreatePeriodRange(payload: {
    startDate: string;
    endDate: string;
  }): void {
    createStartDate = payload.startDate;
    createEndDate = payload.endDate;
    createPeriodId = toPeriodId(payload.startDate);
  }

  return {
    get periods() {
      return periods;
    },
    get selectedPeriodId() {
      return selectedPeriodId;
    },
    get summary() {
      return summary;
    },
    get summaryLoading() {
      return summaryLoading;
    },
    get summaryError() {
      return summaryError;
    },
    get periodSaving() {
      return periodSaving;
    },
    get periodError() {
      return periodError;
    },
    get rangeStartDate() {
      return rangeStartDate;
    },
    get rangeEndDate() {
      return rangeEndDate;
    },
    get createStartDate() {
      return createStartDate;
    },
    get createEndDate() {
      return createEndDate;
    },
    get createPeriodId() {
      return createPeriodId;
    },
    set createPeriodId(value: string) {
      createPeriodId = value;
    },
    get createBudgetInput() {
      return createBudgetInput;
    },
    set createBudgetInput(value: string) {
      createBudgetInput = value;
    },
    get modalOpen() {
      return modalOpen;
    },
    get modalSaving() {
      return modalSaving;
    },
    get modalError() {
      return modalError;
    },
    get selectedDate() {
      return selectedDate;
    },
    get selectedRow() {
      return selectedRow;
    },
    get historyLoading() {
      return historyLoading;
    },
    get historyError() {
      return historyError;
    },
    get historyMutatingId() {
      return historyMutatingId;
    },
    get histories() {
      return histories;
    },
    get modalInputYen() {
      return modalInputYen;
    },
    set modalInputYen(value: string) {
      modalInputYen = value;
    },
    get modalMemo() {
      return modalMemo;
    },
    set modalMemo(value: string) {
      modalMemo = value;
    },
    get modalPreviewAfterYen() {
      return modalPreviewAfterYen;
    },
    get modalPreviewRemainingYen() {
      return modalPreviewRemainingYen;
    },
    get modalPreviewRecommendedYen() {
      return modalPreviewRecommendedYen;
    },
    handleSavePeriod,
    handleRangeChange,
    handleSelectPeriod,
    createInitialPeriod,
    openDayEntry,
    closeDayEntry,
    submitDayEntry,
    updateHistory,
    deleteHistory,
    updateCreatePeriodRange,
  };
}
