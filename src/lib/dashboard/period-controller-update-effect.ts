import { Effect } from "effect";
import { periodSummaryUrl } from "#lib/dashboard/api-urls.ts";
import type { PeriodSummary } from "#lib/dashboard/controller-types.ts";
import type { PeriodUpdateConfirmationState } from "#lib/dashboard/period-update-confirmation-state.svelte.ts";
import {
  fetchPeriodUpdateEffect,
  type PeriodUpdateApiOutcome,
  type PeriodBoundaryUpdateProposal,
  type PeriodUpdateRequest,
} from "#lib/dashboard/period-update-api.ts";
import type { createPeriodSummaryRequestTracker } from "#lib/dashboard/period-summary-request-tracker.ts";
import type { PeriodSummaryRevision } from "#lib/dashboard/period-summary-revision.ts";
import { summarySpendingMatches } from "#lib/dashboard/summary-rows.ts";
import type { SavePeriodPayload } from "#lib/dashboard/types.ts";
import type {
  PeriodSetting,
  PeriodSettingsSubmission,
} from "#lib/dashboard/period-settings-state.svelte.ts";

export type PeriodRefreshError = boolean | ((_error: string) => void);
export type PeriodRefreshCompletion = (
  _result: "accepted" | "failed" | "dropped",
) => void;
export type PeriodUpdateDependencies = {
  readonly confirmationState: PeriodUpdateConfirmationState;
  readonly getSelectedPeriodId: () => string | null;
  readonly getSummary: () => PeriodSummary | null;
  readonly getSummaryLoading: () => boolean;
  readonly publishSummary: (
    _summary: PeriodSummary,
    _submission?: PeriodSettingsSubmission,
  ) => void;
  readonly publishUnavailableSummary: (
    _outcome: Extract<
      PeriodUpdateApiOutcome,
      { readonly kind: "saved-without-summary" }
    >,
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
      .pipe(Effect.result);
    if (listResult._tag === "Success" && listResult.success === false) return;
    if (dependencies.getSelectedPeriodId() !== periodId) return;
    if (listResult._tag === "Failure") {
      if (reportError) dependencies.setError(listResult.failure);
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
  submission: PeriodSettingsSubmission,
  acceptSummary: (() => void) | undefined,
): boolean {
  if (
    dependencies.getSelectedPeriodId() === periodId &&
    outcome.summary.periodId === periodId &&
    (mutationIsFresh ||
      summarySpendingMatches(outcome.summary, dependencies.getSummary()))
  ) {
    dependencies.publishSummary(outcome.summary, submission);
    acceptSummary?.();
    return true;
  }
  return false;
}

function settleUpdateEffect(
  dependencies: PeriodUpdateDependencies,
  input: {
    periodId: string;
    revision: number;
    result: Exclude<PeriodUpdateApiOutcome, { kind: "confirmation-required" }>;
    submission: PeriodSettingsSubmission;
    acceptSummary: (() => void) | undefined;
  },
): Effect.Effect<void, never> {
  const { periodId, revision, result, submission, acceptSummary } = input;
  const mutation = dependencies.summaryRevision.beginMutation(periodId);
  const fresh =
    dependencies.summaryRevision.isMutationFresh(periodId, mutation) &&
    dependencies.summaryRevision.get(periodId) === revision;

  if (
    result.kind === "saved-without-summary" &&
    fresh &&
    result.period.id === periodId
  ) {
    dependencies.summaryRevision.completeMutation(periodId, mutation);
    dependencies.publishUnavailableSummary(result);
    return Effect.void;
  }
  const published =
    result.kind === "updated" &&
    publishUpdatedSummary(
      dependencies,
      periodId,
      result,
      fresh,
      submission,
      acceptSummary,
    );
  if (result.kind === "error") dependencies.setError(result.message);
  dependencies.summaryRevision.completeMutation(periodId, mutation);
  return reconcileEffect(
    dependencies,
    periodId,
    result.kind === "updated",
    fresh,
    result.kind !== "error" && !published ? submission : undefined,
  );
}

export function fetchUpdateWithSummarySync(
  summaryRevision: PeriodSummaryRevision,
  periodId: string,
  body: PeriodUpdateRequest | Pick<SavePeriodPayload, "budgetYen">,
) {
  return Effect.gen(function* () {
    const acceptSummary = summaryRevision.captureSummarySync(periodId);
    const revision = summaryRevision.get(periodId);
    const mutation = summaryRevision.getMutationSequence(periodId);
    const result = yield* fetchPeriodUpdateEffect(
      periodSummaryUrl(periodId),
      {
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
        method: "PUT",
      },
      "保存に失敗しました。",
    );
    const summaryIsFresh =
      summaryRevision.get(periodId) === revision &&
      summaryRevision.getMutationSequence(periodId) === mutation;
    return {
      result,
      acceptSummary: summaryIsFresh ? acceptSummary : undefined,
    };
  });
}

function openConfirmation(
  dependencies: PeriodUpdateDependencies,
  proposal: PeriodBoundaryUpdateProposal,
  payload: SavePeriodPayload,
  periodId: string,
  request: ReturnType<PeriodUpdateDependencies["summaryRequests"]["start"]>,
): void {
  const previousId = proposal.previous.before.id;
  const nextId = proposal.next.before.id;
  const revision = (id: string) =>
    id === periodId ? request.revision : dependencies.summaryRevision.get(id);
  dependencies.confirmationState.open({
    proposal,
    request: {
      startDate: payload.startDate,
      endDate: payload.endDate,
      confirmation: proposal,
    },
    ownership: {
      editedPeriodId: periodId,
      previousId,
      nextId,
      requestSequence: request.sequence,
      selectedPeriodId: periodId,
      previousRevision: revision(previousId),
      nextRevision: revision(nextId),
    },
  });
}

export function createPeriodUpdateEffect(
  dependencies: PeriodUpdateDependencies,
) {
  let saveSequence = 0;
  const savingSequences = { budget: 0, range: 0 };

  return (
    input: SavePeriodPayload,
    operation: PeriodSetting,
  ): Effect.Effect<void, never> => {
    const payload = { ...input };
    const submission = { operation, payload };
    if (operation !== "budget") dependencies.confirmationState.clear();
    const periodId = dependencies.getSelectedPeriodId();
    if (periodId == null || dependencies.getSummaryLoading())
      return Effect.void;
    const currentSaveSequence = ++saveSequence;
    savingSequences[operation] = currentSaveSequence;
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
      const { result, acceptSummary } =
        yield* dependencies.summaryRevision.withMutationSlot(
          periodId,
          "period",
          fetchUpdateWithSummarySync(
            dependencies.summaryRevision,
            periodId,
            operation === "budget"
              ? { budgetYen: payload.budgetYen }
              : { startDate: payload.startDate, endDate: payload.endDate },
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
        if (
          operation === "budget" ||
          result.proposal.editedPeriodId !== periodId
        ) {
          localDependencies.setError("保存に失敗しました。");
        } else {
          openConfirmation(
            dependencies,
            result.proposal,
            payload,
            periodId,
            request,
          );
        }
        return;
      }
      yield* settleUpdateEffect(localDependencies, {
        periodId,
        revision: request.revision,
        result,
        submission,
        acceptSummary,
      });
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          if (savingSequences[operation] === currentSaveSequence)
            dependencies.setSaving(false, operation);
        }),
      ),
    );
  };
}
