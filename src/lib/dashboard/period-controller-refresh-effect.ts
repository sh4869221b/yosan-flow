import { Effect } from "effect";
import { periodSummaryUrl, PERIODS_URL } from "#lib/dashboard/api-urls.ts";
import { fetchJsonEffect } from "#lib/dashboard/fetch-json.ts";
import type {
  PeriodOption,
  PeriodSummary,
} from "#lib/dashboard/controller-types.ts";
import type {
  PeriodRefreshError,
  PeriodRefreshCompletion,
  PeriodUpdateDependencies,
} from "#lib/dashboard/period-controller-update-effect.ts";
import type { PeriodSettingsSubmission } from "#lib/dashboard/period-settings-state.svelte.ts";
import type { PeriodListResponse } from "#lib/dashboard/types.ts";

type Dependencies = Pick<
  PeriodUpdateDependencies,
  "summaryRequests" | "summaryRevision" | "getSelectedPeriodId"
> & {
  readonly publishSummary: (
    _summary: PeriodSummary | null,
    _submission?: PeriodSettingsSubmission,
  ) => void;
  readonly setLoading: (_value: boolean) => void;
  readonly setError: (_value: string | null) => void;
  readonly setPeriods: (_value: PeriodOption[]) => void;
  readonly selectEmpty: () => void;
};
export function createPeriodRefreshEffects(dependencies: Dependencies) {
  const { summaryRequests, summaryRevision, publishSummary } = dependencies;
  function refreshSummaryEffect(
    periodId: string,
    reportError: PeriodRefreshError = true,
    submission?: PeriodSettingsSubmission,
    complete?: PeriodRefreshCompletion,
  ): Effect.Effect<void, never> {
    const request = summaryRequests.start(periodId);
    return Effect.gen(function* () {
      dependencies.setLoading(true);
      dependencies.setError(null);
      if (request.mutationWasActive) {
        yield* summaryRevision.awaitMutationSettlement(
          periodId,
          request.mutationSequence,
        );
        if (summaryRequests.owns(request))
          yield* refreshSummaryEffect(
            periodId,
            reportError,
            submission,
            complete,
          );
        else complete?.("dropped");
        return;
      }
      const result = yield* fetchJsonEffect<PeriodSummary>(
        periodSummaryUrl(periodId),
        undefined,
        "再取得に失敗しました。",
      ).pipe(Effect.result);
      if (summaryRequests.isFresh(request)) {
        if (result._tag === "Failure") {
          complete?.("failed");
          if (typeof reportError === "function") reportError(result.failure);
          else if (reportError) dependencies.setError(result.failure);
        } else if (result.success.periodId === periodId) {
          publishSummary(result.success, submission);
          complete?.("accepted");
        } else complete?.("dropped");
      } else complete?.("dropped");
      if (summaryRequests.owns(request)) dependencies.setLoading(false);
    });
  }

  function refreshPeriodListEffect(
    preferredPeriodId?: string,
    reportSummaryError: PeriodRefreshError = true,
    submission?: PeriodSettingsSubmission,
    complete?: PeriodRefreshCompletion,
  ): Effect.Effect<void | boolean, string> {
    const request = summaryRequests.start(
      preferredPeriodId ?? dependencies.getSelectedPeriodId(),
    );
    dependencies.setLoading(false);
    return Effect.gen(function* () {
      const result = yield* fetchJsonEffect<PeriodListResponse<PeriodOption>>(
        PERIODS_URL,
        undefined,
        "保存に失敗しました。",
      ).pipe(Effect.result);
      if (!summaryRequests.owns(request)) {
        complete?.("dropped");
        return false;
      }
      if (result._tag === "Failure") {
        complete?.("failed");
        return yield* Effect.fail(result.failure);
      }
      if (complete && !summaryRequests.isFresh(request)) {
        complete("dropped");
        return false;
      }
      const periods = result.success.periods ?? [];
      dependencies.setPeriods(periods);
      if (periods.length === 0) {
        complete?.("dropped");
        dependencies.selectEmpty();
        publishSummary(null);
        return;
      }
      const matched =
        periods.find((period) => period.id === preferredPeriodId) ??
        periods.find(
          (period) => period.id === dependencies.getSelectedPeriodId(),
        ) ??
        periods[periods.length - 1];
      if (
        complete &&
        (matched.id !== preferredPeriodId ||
          dependencies.getSelectedPeriodId() !== preferredPeriodId)
      ) {
        complete("dropped");
        return false;
      }
      yield* refreshSummaryEffect(
        matched.id,
        reportSummaryError,
        submission,
        complete,
      );
    });
  }

  return { refreshSummaryEffect, refreshPeriodListEffect };
}
