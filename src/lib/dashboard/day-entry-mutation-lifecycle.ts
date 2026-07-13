import { Deferred, Effect } from "effect";
import { dayAddUrl } from "$lib/dashboard/api-urls";
import type { DailyRow, PeriodSummary } from "$lib/dashboard/controller-types";
import { createDayEntrySubmissionTracker } from "$lib/dashboard/day-entry-submission-tracker";
import { createDayEntrySummaryReconciliation } from "$lib/dashboard/day-entry-summary-reconciliation";
import { fetchJsonEffect } from "$lib/dashboard/fetch-json";
import type { PeriodSummaryRevision } from "$lib/dashboard/period-summary-revision";
import {
  findSummaryRow,
  summaryConfigurationMatches,
  summaryIsMoreComplete,
} from "$lib/dashboard/summary-rows";
import type { SubmitDayEntryPayload } from "$lib/dashboard/types";

type Dependencies = {
  readonly cancelHistoryLoad?: (_periodId: string, _date: string) => void;
  readonly closeModal: () => void;
  readonly getHistoryMutationSequence: (_periodId: string) => number;
  readonly getSelectedDate: () => string | null;
  readonly getSelectedPeriodId: () => string | null;
  readonly getSummary: () => PeriodSummary | null;
  readonly loadHistoryEffect: (_date: string) => Effect.Effect<void, never>;
  readonly setError: (_error: string | null) => void;
  readonly setSaving: (_saving: boolean) => void;
  readonly setSelectedRow: (_row: DailyRow | null) => void;
  readonly setSummary: (_summary: PeriodSummary) => void;
  readonly summaryRevision: PeriodSummaryRevision;
};

export function createDayEntryMutationLifecycle(dependencies: Dependencies) {
  let modalGeneration = 0;
  let modalSessionChanged = Effect.runSync(Deferred.make<void>());
  const submissionTracker = createDayEntrySubmissionTracker(
    dependencies.summaryRevision,
  );
  const reconcileSummaryEffect = createDayEntrySummaryReconciliation({
    getHistoryMutationSequence: dependencies.getHistoryMutationSequence,
    getSelectedDate: dependencies.getSelectedDate,
    getSelectedPeriodId: dependencies.getSelectedPeriodId,
    setSelectedRow: dependencies.setSelectedRow,
    setSummary: dependencies.setSummary,
    submissionTracker,
    summaryRevision: dependencies.summaryRevision,
  });

  function submitEffect(
    payload: SubmitDayEntryPayload,
  ): Effect.Effect<void, never> {
    const selectedPeriodId = dependencies.getSelectedPeriodId();
    if (selectedPeriodId == null) return Effect.void;
    const submittedGeneration = modalGeneration;
    const submittedDate = payload.date;
    const submittedSessionChanged = modalSessionChanged;
    return Effect.gen(function* () {
      if (submittedGeneration === modalGeneration) {
        dependencies.setSaving(true);
        dependencies.setError(null);
      }
      const outcome = yield* dependencies.summaryRevision
        .withMutationSlot(
          selectedPeriodId,
          "add",
          Effect.gen(function* () {
            dependencies.cancelHistoryLoad?.(selectedPeriodId, submittedDate);
            const mutationSequence =
              dependencies.getHistoryMutationSequence(selectedPeriodId);
            const summarySequence = submissionTracker.start(selectedPeriodId);
            let remainingSubmissions = 0;
            let submissionFinished = false;
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
            ).pipe(
              Effect.either,
              Effect.onInterrupt(() =>
                Effect.sync(() => {
                  if (!submissionFinished) {
                    remainingSubmissions = submissionTracker.finish(
                      selectedPeriodId,
                      summarySequence,
                    );
                    if (remainingSubmissions === 0) {
                      submissionTracker.clearBest(selectedPeriodId);
                    }
                  }
                }),
              ),
            );
            remainingSubmissions = submissionTracker.finish(
              selectedPeriodId,
              summarySequence,
            );
            submissionFinished = true;
            if (result._tag === "Left") {
              if (submittedGeneration === modalGeneration) {
                dependencies.setError(result.left);
              }
            } else {
              submissionTracker.accept(
                selectedPeriodId,
                result.right,
                mutationSequence,
                dependencies.getHistoryMutationSequence(selectedPeriodId),
              );
            }
            const shouldRefreshHistory =
              result._tag === "Right" &&
              dependencies.getSelectedPeriodId() === selectedPeriodId &&
              (submittedGeneration === modalGeneration ||
                dependencies.getSelectedDate() === submittedDate);
            const bestSummary = submissionTracker.getBest(
              selectedPeriodId,
              dependencies.getHistoryMutationSequence(selectedPeriodId),
            );
            if (
              dependencies.getSelectedPeriodId() === selectedPeriodId &&
              bestSummary != null &&
              summaryConfigurationMatches(
                bestSummary,
                dependencies.getSummary(),
              ) &&
              summaryIsMoreComplete(bestSummary, dependencies.getSummary())
            ) {
              dependencies.summaryRevision.publish(
                bestSummary,
                dependencies.setSummary,
              );
              dependencies.setSelectedRow(
                findSummaryRow(bestSummary, dependencies.getSelectedDate()),
              );
            }
            if (remainingSubmissions === 0) {
              submissionTracker.clearBest(selectedPeriodId);
            }
            if (
              result._tag === "Right" &&
              submittedGeneration === modalGeneration
            ) {
              dependencies.closeModal();
            }
            return { remainingSubmissions, shouldRefreshHistory };
          }),
        )
        .pipe(
          Effect.ensuring(
            Effect.sync(() => {
              if (submittedGeneration === modalGeneration) {
                dependencies.setSaving(false);
              }
            }),
          ),
        );
      if (
        outcome.remainingSubmissions === 0 &&
        submissionTracker.shouldReconcile(selectedPeriodId)
      ) {
        yield* reconcileSummaryEffect(selectedPeriodId, submittedDate);
      }
      if (
        outcome.shouldRefreshHistory &&
        dependencies.getSelectedPeriodId() === selectedPeriodId &&
        (submittedGeneration === modalGeneration ||
          dependencies.getSelectedDate() === submittedDate)
      ) {
        const sessionChanged =
          submittedGeneration === modalGeneration
            ? submittedSessionChanged
            : modalSessionChanged;
        yield* Effect.raceFirst(
          dependencies.loadHistoryEffect(submittedDate),
          Deferred.await(sessionChanged),
        );
      }
    });
  }

  return {
    beginModalSession(): void {
      Effect.runSync(Deferred.succeed(modalSessionChanged, undefined));
      modalSessionChanged = Effect.runSync(Deferred.make<void>());
      modalGeneration += 1;
      dependencies.setSaving(false);
    },
    submitEffect,
  };
}
