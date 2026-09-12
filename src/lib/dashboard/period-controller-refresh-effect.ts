import { Effect } from "effect";
import { periodSummaryUrl, periodsUrl } from "$lib/dashboard/api-urls";
import { fetchJsonEffect } from "$lib/dashboard/fetch-json";
import type {
  PeriodOption,
  PeriodSummary,
} from "$lib/dashboard/controller-types";
import type {
  PeriodRefreshError,
  PeriodRefreshCompletion,
  PeriodUpdateDependencies,
} from "$lib/dashboard/period-controller-update-effect";
import type { PeriodSettingsSubmission } from "$lib/dashboard/period-settings-state.svelte";
import type { PeriodListResponse } from "$lib/dashboard/types";

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
      ).pipe(Effect.either);
      if (summaryRequests.isFresh(request)) {
        if (result._tag === "Left") {
          complete?.("failed");
          if (typeof reportError === "function") reportError(result.left);
          else if (reportError) dependencies.setError(result.left);
        } else if (result.right.periodId === periodId) {
          publishSummary(result.right, submission);
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
        periodsUrl(),
        undefined,
        "保存に失敗しました。",
      ).pipe(Effect.either);
      if (!summaryRequests.owns(request)) {
        complete?.("dropped");
        return false;
      }
      if (result._tag === "Left") {
        complete?.("failed");
        return yield* Effect.fail(result.left);
      }
      if (complete && !summaryRequests.isFresh(request)) {
        complete("dropped");
        return false;
      }
      const periods = result.right.periods ?? [];
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
