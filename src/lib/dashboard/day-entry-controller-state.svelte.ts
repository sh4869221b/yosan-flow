import { Deferred, Effect } from "effect";
import { runClientEffect } from "$lib/dashboard/client-effect";
import { fetchJsonEffect } from "$lib/dashboard/fetch-json";
import { dayAddUrl, periodSummaryUrl } from "$lib/dashboard/api-urls";
import { createDayEntrySubmissionTracker } from "$lib/dashboard/day-entry-submission-tracker";
import { findSummaryRow } from "$lib/dashboard/summary-rows";
import {
  getModalPreviewAfterYen,
  getModalPreviewRecommendedYen,
  getModalPreviewRemainingYen,
  getModalRemainingRows,
} from "$lib/dashboard/modal-preview";
import type { SubmitDayEntryPayload } from "$lib/dashboard/types";
import type { DailyRow, PeriodSummary } from "$lib/dashboard/controller-types";

type HistoryController = {
  readonly getMutationSequence: (_periodId: string) => number;
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
  const submissionTracker = createDayEntrySubmissionTracker();
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
    const submittedMutationSequence =
      dependencies.historyController.getMutationSequence(selectedPeriodId);
    submissionTracker.start(selectedPeriodId);
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
      const remainingSubmissions = submissionTracker.finish(selectedPeriodId);
      let shouldRefreshHistory = false;
      if (result._tag === "Left") {
        if (submittedGeneration === modalGeneration) {
          modalError = result.left;
        }
      } else {
        submissionTracker.accept(
          selectedPeriodId,
          result.right,
          submittedMutationSequence,
          dependencies.historyController.getMutationSequence(selectedPeriodId),
        );
        const submittedPeriodIsCurrent =
          dependencies.getSelectedPeriodId() === selectedPeriodId;
        const submittedDateIsCurrent =
          submittedGeneration === modalGeneration ||
          selectedDate === submittedDate;
        if (submittedPeriodIsCurrent && submittedDateIsCurrent) {
          shouldRefreshHistory = true;
        }
      }
      const bestSuccessfulSummary = submissionTracker.getBest(
        selectedPeriodId,
        dependencies.historyController.getMutationSequence(selectedPeriodId),
      );
      if (
        dependencies.getSelectedPeriodId() === selectedPeriodId &&
        bestSuccessfulSummary != null &&
        dependencies.getSummary() !== bestSuccessfulSummary
      ) {
        dependencies.setSummary(bestSuccessfulSummary);
        selectedRow = findSummaryRow(bestSuccessfulSummary, selectedDate);
      }
      if (remainingSubmissions === 0) {
        submissionTracker.clearBest(selectedPeriodId);
      }
      if (result._tag === "Right" && submittedGeneration === modalGeneration) {
        closeDayEntry();
      }
      if (submittedGeneration === modalGeneration) {
        modalSaving = false;
      }
      if (remainingSubmissions === 0) {
        refreshSequence += 1;
        const currentRefreshSequence = refreshSequence;
        latestRefreshSequences.set(selectedPeriodId, currentRefreshSequence);
        const refreshMutationSequence =
          dependencies.historyController.getMutationSequence(selectedPeriodId);
        const refreshResult = yield* fetchJsonEffect<PeriodSummary>(
          periodSummaryUrl(selectedPeriodId),
          undefined,
          "再取得に失敗しました。",
        ).pipe(Effect.either);
        const refreshIsCurrent =
          latestRefreshSequences.get(selectedPeriodId) ===
            currentRefreshSequence &&
          !submissionTracker.hasActive(selectedPeriodId) &&
          dependencies.historyController.getMutationSequence(
            selectedPeriodId,
          ) === refreshMutationSequence &&
          dependencies.getSelectedPeriodId() === selectedPeriodId;
        if (
          refreshResult._tag === "Right" &&
          refreshIsCurrent &&
          refreshResult.right.periodId === selectedPeriodId
        ) {
          dependencies.setSummary(refreshResult.right);
          if (selectedDate === submittedDate) {
            selectedRow = findSummaryRow(refreshResult.right, submittedDate);
          }
        }
      }
      if (
        shouldRefreshHistory &&
        dependencies.getSelectedPeriodId() === selectedPeriodId &&
        (submittedGeneration === modalGeneration ||
          selectedDate === submittedDate)
      ) {
        const sessionChanged =
          submittedGeneration === modalGeneration
            ? submittedSessionChanged
            : modalSessionChanged;
        yield* Effect.raceFirst(
          dependencies.historyController.loadHistoryEffect(submittedDate),
          Deferred.await(sessionChanged),
        );
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
      selectedRow = findSummaryRow(summary, selectedDate);
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
