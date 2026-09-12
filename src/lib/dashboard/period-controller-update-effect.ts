import { Effect } from "effect";
import { periodSummaryUrl } from "$lib/dashboard/api-urls";
import type { PeriodSummary } from "$lib/dashboard/controller-types";
import type {
  PendingPeriodUpdateConfirmation,
  PeriodUpdateConfirmationState,
} from "$lib/dashboard/period-update-confirmation-state.svelte";
import {
  fetchPeriodUpdateEffect,
  type PeriodUpdateApiOutcome,
} from "$lib/dashboard/period-update-api";
import type { createPeriodSummaryRequestTracker } from "$lib/dashboard/period-summary-request-tracker";
import type { PeriodSummaryRevision } from "$lib/dashboard/period-summary-revision";
import { summarySpendingMatches } from "$lib/dashboard/summary-rows";
import type { SavePeriodPayload } from "$lib/dashboard/types";
import type {
  PeriodSetting,
  PeriodSettingsSubmission,
} from "$lib/dashboard/period-settings-state.svelte";

export type PeriodRefreshError = boolean | ((_error: string) => void);
export type PeriodRefreshCompletion = (
  _result: "accepted" | "failed" | "dropped",
) => void;
export type PeriodUpdateDependencies = {
  readonly confirmationState?: PeriodUpdateConfirmationState;
  readonly getSelectedPeriodId: () => string | null;
  readonly getSummary: () => PeriodSummary | null;
  readonly getSummaryLoading: () => boolean;
  readonly publishSummary: (
    _summary: PeriodSummary,
    _submission?: PeriodSettingsSubmission,
  ) => void;
  readonly refreshPeriodListEffect: (
    _periodId: string,
    _reportSummaryError?: PeriodRefreshError,
    _submission?: PeriodSettingsSubmission,
    _complete?: PeriodRefreshCompletion,
  ) => Effect.Effect<void | boolean, string>;
  readonly refreshSummaryEffect: (
    _periodId: string,
    _reportError?: PeriodRefreshError,
    _submission?: PeriodSettingsSubmission,
    _complete?: PeriodRefreshCompletion,
  ) => Effect.Effect<void, never>;
  readonly setError: (
    _error: string | null,
    _operation?: PeriodSetting,
  ) => void;
  readonly setSaving: (_saving: boolean, _operation?: PeriodSetting) => void;
  readonly summaryRequests: ReturnType<
    typeof createPeriodSummaryRequestTracker
  >;
  readonly summaryRevision: PeriodSummaryRevision;
};

function requestEffect(
  periodId: string,
  payload: SavePeriodPayload | PendingPeriodUpdateConfirmation["request"],
) {
  return fetchPeriodUpdateEffect(
    periodSummaryUrl(periodId),
    {
      body: JSON.stringify(payload),
      headers: { "content-type": "application/json" },
      method: "PUT",
    },
    "保存に失敗しました。",
  );
}

function reconcileEffect(
  dependencies: PeriodUpdateDependencies,
  periodId: string,
  reportError: boolean,
  mutationIsFresh: boolean,
  submission?: PeriodSettingsSubmission,
): Effect.Effect<void, never> {
  return Effect.gen(function* () {
    const revision = dependencies.summaryRevision.get(periodId);
    const report = reportError ? dependencies.setError : false;
    const listResult = yield* dependencies
      .refreshPeriodListEffect(periodId, report, submission)
      .pipe(Effect.either);
    if (listResult._tag === "Right" && listResult.right === false) return;
    if (dependencies.getSelectedPeriodId() !== periodId) return;
    if (listResult._tag === "Left") {
      if (reportError) dependencies.setError(listResult.left);
      yield* submission == null
        ? dependencies.refreshSummaryEffect(periodId, false)
        : dependencies.refreshSummaryEffect(periodId, false, submission);
    } else if (
      !mutationIsFresh &&
      dependencies.summaryRevision.get(periodId) === revision
    ) {
      yield* dependencies.refreshSummaryEffect(periodId, report, submission);
    }
  });
}

function publishUpdatedSummary(
  dependencies: PeriodUpdateDependencies,
  periodId: string,
  outcome: Extract<PeriodUpdateApiOutcome, { readonly kind: "updated" }>,
  mutationIsFresh: boolean,
  submission?: PeriodSettingsSubmission,
): boolean {
  if (
    dependencies.getSelectedPeriodId() === periodId &&
    outcome.summary.periodId === periodId &&
    (mutationIsFresh ||
      summarySpendingMatches(outcome.summary, dependencies.getSummary()))
  ) {
    dependencies.publishSummary(outcome.summary, submission);
    return true;
  }
  return false;
}

export function createPeriodUpdateEffect(
  dependencies: PeriodUpdateDependencies,
) {
  let saveSequence = 0;
  const savingSequences = { budget: 0, range: 0 };

  return (
    input: SavePeriodPayload,
    operation?: PeriodSetting,
  ): Effect.Effect<void, never> => {
    const payload = { ...input };
    const submission = operation == null ? undefined : { operation, payload };
    if (operation !== "budget") dependencies.confirmationState?.clear();
    const periodId = dependencies.getSelectedPeriodId();
    if (periodId == null || dependencies.getSummaryLoading())
      return Effect.void;
    const currentSaveSequence = ++saveSequence;
    const savingOperation = operation ?? "range";
    savingSequences[savingOperation] = currentSaveSequence;
    const request = dependencies.summaryRequests.start(periodId);
    const localDependencies = {
      ...dependencies,
      setError: (error: string | null) => {
        if (
          currentSaveSequence === saveSequence &&
          dependencies.getSelectedPeriodId() === periodId
        )
          dependencies.setError(error, operation);
      },
    };
    dependencies.setSaving(true, operation);
    localDependencies.setError(null);
    return Effect.gen(function* () {
      let legacyMutation: number | null = null;
      const result = yield* dependencies.summaryRevision.withMutationSlot(
        periodId,
        "period",
        Effect.gen(function* () {
          if (dependencies.confirmationState == null) {
            legacyMutation =
              dependencies.summaryRevision.beginMutation(periodId);
          }
          return yield* requestEffect(periodId, payload);
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => {
              if (legacyMutation != null) {
                dependencies.summaryRevision.completeMutation(
                  periodId,
                  legacyMutation,
                );
              }
            }),
          ),
        ),
      );
      if (
        currentSaveSequence !== saveSequence ||
        !dependencies.summaryRequests.owns(request) ||
        dependencies.getSelectedPeriodId() !== periodId
      ) {
        return;
      }
      if (result.kind === "confirmation-required") {
        if (operation === "budget") {
          localDependencies.setError("保存に失敗しました。");
          return;
        }
        const successorId = result.proposal.successor.before.id;
        dependencies.confirmationState?.open({
          proposal: result.proposal,
          request: { ...payload, confirmation: result.proposal },
          ownership: {
            targetId: periodId,
            successorId,
            requestSequence: request.sequence,
            selectedPeriodId: periodId,
            targetRevision: request.revision,
            successorRevision: dependencies.summaryRevision.get(successorId),
          },
        });
        return;
      }
      const mutation =
        legacyMutation ?? dependencies.summaryRevision.beginMutation(periodId);
      const mutationIsFresh =
        dependencies.summaryRevision.isMutationFresh(periodId, mutation) &&
        dependencies.summaryRevision.get(periodId) === request.revision;
      let published = false;
      if (result.kind === "updated") {
        published = publishUpdatedSummary(
          dependencies,
          periodId,
          result,
          mutationIsFresh,
          submission,
        );
      } else {
        localDependencies.setError(result.message);
      }
      if (legacyMutation == null) {
        dependencies.summaryRevision.completeMutation(periodId, mutation);
      }
      yield* reconcileEffect(
        localDependencies,
        periodId,
        result.kind === "updated",
        mutationIsFresh,
        result.kind === "updated" && !published ? submission : undefined,
      );
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          if (savingSequences[savingOperation] === currentSaveSequence)
            dependencies.setSaving(false, operation);
        }),
      ),
    );
  };
}
