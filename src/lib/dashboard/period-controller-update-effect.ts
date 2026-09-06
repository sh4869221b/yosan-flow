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

type Dependencies = {
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
    _reportSummaryError?: boolean,
    _submission?: PeriodSettingsSubmission,
  ) => Effect.Effect<void, string>;
  readonly refreshSummaryEffect: (
    _periodId: string,
    _reportError?: boolean,
    _submission?: PeriodSettingsSubmission,
  ) => Effect.Effect<void, never>;
  readonly setError: (_error: string | null) => void;
  readonly setSaving: (_saving: boolean) => void;
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
  dependencies: Dependencies,
  periodId: string,
  reportError: boolean,
  mutationIsFresh: boolean,
  submission?: PeriodSettingsSubmission,
): Effect.Effect<void, never> {
  return Effect.gen(function* () {
    const revision = dependencies.summaryRevision.get(periodId);
    const listResult = yield* dependencies
      .refreshPeriodListEffect(periodId, reportError, submission)
      .pipe(Effect.either);
    if (listResult._tag === "Left") {
      if (reportError) dependencies.setError(listResult.left);
      yield* submission == null
        ? dependencies.refreshSummaryEffect(periodId, reportError)
        : dependencies.refreshSummaryEffect(periodId, reportError, submission);
    } else if (
      !mutationIsFresh &&
      dependencies.summaryRevision.get(periodId) === revision
    ) {
      yield* dependencies.refreshSummaryEffect(periodId, true, submission);
    }
  });
}

function publishUpdatedSummary(
  dependencies: Dependencies,
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

export function createPeriodUpdateEffect(dependencies: Dependencies) {
  let saveSequence = 0;

  return (
    payload: SavePeriodPayload,
    operation?: PeriodSetting,
  ): Effect.Effect<void, never> => {
    const submission = operation == null ? undefined : { operation, payload };
    dependencies.confirmationState?.clear();
    const periodId = dependencies.getSelectedPeriodId();
    if (periodId == null || dependencies.getSummaryLoading())
      return Effect.void;
    const currentSaveSequence = ++saveSequence;
    return Effect.gen(function* () {
      dependencies.setSaving(true);
      dependencies.setError(null);
      const request = dependencies.summaryRequests.start(periodId);
      let legacyMutation: number | null = null;
      const result = yield* dependencies.summaryRevision
        .withMutationSlot(
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
        )
        .pipe(
          Effect.ensuring(
            Effect.sync(() => {
              if (currentSaveSequence === saveSequence) {
                dependencies.setSaving(false);
              }
            }),
          ),
        );
      if (
        !dependencies.summaryRequests.owns(request) ||
        dependencies.getSelectedPeriodId() !== periodId
      ) {
        return;
      }
      if (result.kind === "confirmation-required") {
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
        dependencies.setError(result.message);
      }
      if (legacyMutation == null) {
        dependencies.summaryRevision.completeMutation(periodId, mutation);
      }
      yield* reconcileEffect(
        dependencies,
        periodId,
        result.kind === "updated",
        mutationIsFresh,
        result.kind === "updated" && !published ? submission : undefined,
      );
    });
  };
}

export function createPeriodConfirmEffect(dependencies: Dependencies) {
  return (
    pending: PendingPeriodUpdateConfirmation,
  ): Effect.Effect<void, never> =>
    dependencies.summaryRevision
      .withMutationSlot(
        pending.ownership.targetId,
        "period",
        Effect.gen(function* () {
          const confirmationState = dependencies.confirmationState;
          if (confirmationState == null || !confirmationState.owns(pending)) {
            confirmationState?.clearOwned(pending);
            return;
          }
          const periodId = pending.ownership.targetId;
          const request = dependencies.summaryRequests.start(periodId);
          dependencies.setError(null);
          const mutation = dependencies.summaryRevision.beginMutation(periodId);
          const outcome = yield* requestEffect(periodId, pending.request).pipe(
            Effect.ensuring(
              Effect.sync(() =>
                dependencies.summaryRevision.completeMutation(
                  periodId,
                  mutation,
                ),
              ),
            ),
          );
          confirmationState.clearOwned(pending);
          if (outcome.kind === "updated") {
            const selected = dependencies.getSelectedPeriodId() === periodId;
            const ownsRequest = dependencies.summaryRequests.owns(request);
            if (
              selected &&
              ownsRequest &&
              outcome.summary.periodId === periodId
            ) {
              dependencies.publishSummary(outcome.summary, {
                operation: "range",
                payload: pending.request,
              });
            } else {
              dependencies.summaryRevision.advance(periodId);
            }
            dependencies.summaryRevision.advance(pending.ownership.successorId);
            if (selected && ownsRequest) {
              yield* reconcileEffect(dependencies, periodId, true, true);
            }
            return;
          }
          if (
            dependencies.summaryRequests.owns(request) &&
            dependencies.getSelectedPeriodId() === periodId
          ) {
            dependencies.setError(
              outcome.kind === "error"
                ? outcome.message
                : "保存に失敗しました。",
            );
            yield* reconcileEffect(dependencies, periodId, false, true);
          }
        }),
      )
      .pipe(
        Effect.ensuring(
          Effect.sync(() =>
            dependencies.confirmationState?.finishConfirmation(),
          ),
        ),
      );
}
