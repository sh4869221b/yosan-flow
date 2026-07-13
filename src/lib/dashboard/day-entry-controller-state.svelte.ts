import { Deferred, Effect } from "effect";
import { runClientEffect } from "$lib/dashboard/client-effect";
import { fetchJsonEffect } from "$lib/dashboard/fetch-json";
import { dayAddUrl, periodSummaryUrl } from "$lib/dashboard/api-urls";
import {
  getModalPreviewAfterYen,
  getModalPreviewRecommendedYen,
  getModalPreviewRemainingYen,
  getModalRemainingRows,
} from "$lib/dashboard/modal-preview";
import type { SubmitDayEntryPayload } from "$lib/dashboard/types";
import type { DailyRow, PeriodSummary } from "$lib/dashboard/controller-types";

type HistoryController = {
  readonly loadHistory: (_date: string) => void;
  readonly loadHistoryEffect: (_date: string) => Effect.Effect<void, never>;
  readonly resetHistories: () => void;
};

type DayEntryControllerDependencies = {
  readonly getSelectedPeriodId: () => string | null;
  readonly getSummary: () => PeriodSummary | null;
  readonly historyController: HistoryController;
  readonly setSummary: (_summary: PeriodSummary) => void;
};

export function createDayEntryControllerState(
  dependencies: DayEntryControllerDependencies,
) {
  let modalOpen = $state(false);
  let modalSaving = $state(false);
  let modalError = $state<string | null>(null);
  let selectedDate = $state<string | null>(null);
  let selectedRow = $state<DailyRow | null>(null);
  let modalInputYen = $state("");
  let modalMemo = $state("");
  let modalGeneration = 0;
  let submissionSequence = 0;
  const latestAppliedSuccessfulSubmissionSequences = new Map<string, number>();
  const activeSubmissionCounts = new Map<string, number>();
  const latestRefreshSequences = new Map<string, number>();
  let refreshSequence = 0;
  let modalSessionChanged = Effect.runSync(Deferred.make<void>());

  const modalPreviewAfterYen = $derived(
    getModalPreviewAfterYen(selectedRow, modalInputYen),
  );
  const modalRemainingRows = $derived(
    getModalRemainingRows(dependencies.getSummary(), selectedDate),
  );
  const modalPreviewRemainingYen = $derived(
    getModalPreviewRemainingYen(
      dependencies.getSummary(),
      selectedRow,
      modalPreviewAfterYen,
    ),
  );
  const modalPreviewRecommendedYen = $derived(
    getModalPreviewRecommendedYen(modalPreviewRemainingYen, modalRemainingRows),
  );

  function closeDayEntry(): void {
    modalOpen = false;
    modalError = null;
  }

  function submitDayEntryEffect(
    payload: SubmitDayEntryPayload,
  ): Effect.Effect<void, never> {
    const selectedPeriodId = dependencies.getSelectedPeriodId();
    if (selectedPeriodId == null) {
      return Effect.void;
    }
    const submittedGeneration = modalGeneration;
    const submittedDate = payload.date;
    const submittedSessionChanged = modalSessionChanged;
    submissionSequence += 1;
    const submittedSequence = submissionSequence;
    activeSubmissionCounts.set(
      selectedPeriodId,
      (activeSubmissionCounts.get(selectedPeriodId) ?? 0) + 1,
    );
    return Effect.gen(function* () {
      if (submittedGeneration === modalGeneration) {
        modalSaving = true;
        modalError = null;
      }
      const result = yield* fetchJsonEffect<PeriodSummary>(
        dayAddUrl(selectedPeriodId, submittedDate),
        {
          body: JSON.stringify({
            inputYen: payload.inputYen,
            memo: payload.memo,
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        },
        "保存に失敗しました。",
      ).pipe(Effect.either);
      const remainingSubmissions =
        (activeSubmissionCounts.get(selectedPeriodId) ?? 1) - 1;
      activeSubmissionCounts.set(selectedPeriodId, remainingSubmissions);
      if (remainingSubmissions === 0) {
        activeSubmissionCounts.delete(selectedPeriodId);
      }
      if (result._tag === "Left") {
        if (submittedGeneration === modalGeneration) {
          modalError = result.left;
        }
      } else {
        const submittedPeriodIsCurrent =
          dependencies.getSelectedPeriodId() === selectedPeriodId &&
          result.right.periodId === selectedPeriodId;
        if (
          submittedPeriodIsCurrent &&
          submittedSequence >
            (latestAppliedSuccessfulSubmissionSequences.get(selectedPeriodId) ??
              0)
        ) {
          dependencies.setSummary(result.right);
          latestAppliedSuccessfulSubmissionSequences.set(
            selectedPeriodId,
            submittedSequence,
          );
        }
        if (
          submittedPeriodIsCurrent &&
          (submittedGeneration === modalGeneration ||
            selectedDate === submittedDate)
        ) {
          selectedRow =
            result.right.dailyRows.find((row) => row.date === submittedDate) ??
            null;
          const sessionChanged =
            submittedGeneration === modalGeneration
              ? submittedSessionChanged
              : modalSessionChanged;
          yield* Effect.raceFirst(
            dependencies.historyController.loadHistoryEffect(submittedDate),
            Deferred.await(sessionChanged),
          );
        }
      }
      if (remainingSubmissions === 0) {
        refreshSequence += 1;
        const currentRefreshSequence = refreshSequence;
        latestRefreshSequences.set(selectedPeriodId, currentRefreshSequence);
        const refreshResult = yield* fetchJsonEffect<PeriodSummary>(
          periodSummaryUrl(selectedPeriodId),
          undefined,
          "再取得に失敗しました。",
        ).pipe(Effect.either);
        const refreshIsCurrent =
          latestRefreshSequences.get(selectedPeriodId) ===
            currentRefreshSequence &&
          !activeSubmissionCounts.has(selectedPeriodId) &&
          dependencies.getSelectedPeriodId() === selectedPeriodId;
        if (
          refreshResult._tag === "Right" &&
          refreshIsCurrent &&
          refreshResult.right.periodId === selectedPeriodId
        ) {
          dependencies.setSummary(refreshResult.right);
          if (selectedDate === submittedDate) {
            selectedRow =
              refreshResult.right.dailyRows.find(
                (row) => row.date === submittedDate,
              ) ?? null;
          }
        }
      }
      if (result._tag === "Right" && submittedGeneration === modalGeneration) {
        closeDayEntry();
      }
      if (submittedGeneration === modalGeneration) {
        modalSaving = false;
      }
    });
  }

  return {
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
    setSelectedRow(row: DailyRow | null): void {
      selectedRow = row;
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
    openDayEntry(payload: { date: string }): void {
      const summary = dependencies.getSummary();
      if (summary == null) {
        return;
      }
      Effect.runSync(Deferred.succeed(modalSessionChanged, undefined));
      modalSessionChanged = Effect.runSync(Deferred.make<void>());
      modalGeneration += 1;
      modalSaving = false;
      selectedDate = payload.date;
      selectedRow =
        summary.dailyRows.find((row) => row.date === selectedDate) ?? null;
      modalError = null;
      modalOpen = true;
      modalInputYen = "";
      modalMemo = "";
      dependencies.historyController.resetHistories();
      dependencies.historyController.loadHistory(payload.date);
    },
    closeDayEntry,
    submitDayEntry(payload: SubmitDayEntryPayload): void {
      runClientEffect(submitDayEntryEffect(payload));
    },
  };
}
