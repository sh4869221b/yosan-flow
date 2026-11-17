import { Effect } from "effect";
import { PERIODS_URL } from "#lib/dashboard/api-urls.ts";
import { getJstToday } from "#lib/dashboard/date.ts";
import { selectDashboardPeriodId } from "#lib/dashboard/select-dashboard-period.ts";
import { fetchJsonEffect } from "#lib/dashboard/fetch-json.ts";
import type {
  PeriodOption,
  PeriodSummary,
} from "#lib/dashboard/controller-types.ts";
import type { PeriodUpdateDependencies } from "#lib/dashboard/period-controller-update-effect.ts";
import type { PeriodListResponse } from "#lib/dashboard/types.ts";

type Dependencies = Pick<
  PeriodUpdateDependencies,
  "summaryRequests" | "summaryRevision" | "getSelectedPeriodId"
> & {
  readonly publishSummary: (_summary: PeriodSummary | null) => void;
  readonly setError: (_value: string | null) => void;
  readonly setLoading: (_value: boolean) => void;
  readonly setPeriods: (_value: PeriodOption[]) => void;
  readonly selectEmpty: () => void;
  readonly refreshSummary: (_periodId: string) => Effect.Effect<void, never>;
};

export function createPeriodResumeRefreshEffect(dependencies: Dependencies) {
  function refreshOnResumeEffect(): Effect.Effect<void, never> {
    const periodId = dependencies.getSelectedPeriodId();
    const request = dependencies.summaryRequests.start(periodId);
    const ownsSelection = () =>
      dependencies.summaryRequests.owns(request) &&
      dependencies.getSelectedPeriodId() === periodId;
    const isFresh = () =>
      ownsSelection() &&
      (periodId == null || dependencies.summaryRequests.isFresh(request));

    return Effect.gen(function* () {
      // This background request supersedes any foreground read, including its
      // loading indicator. The old read can no longer clear it through ownership.
      dependencies.setLoading(false);
      dependencies.setError(null);
      if (request.mutationWasActive && periodId != null) {
        yield* dependencies.summaryRevision.awaitMutationSettlement(
          periodId,
          request.mutationSequence,
        );
        if (ownsSelection()) yield* refreshOnResumeEffect();
        return;
      }
      const result = yield* fetchJsonEffect<PeriodListResponse<PeriodOption>>(
        PERIODS_URL,
        undefined,
        "再取得に失敗しました。",
      ).pipe(Effect.result);
      if (!isFresh()) return;
      if (result._tag === "Failure") {
        dependencies.setError(result.failure);
        return;
      }
      const periods = result.success.periods ?? [];
      dependencies.setPeriods(periods);
      const selectedId = selectDashboardPeriodId(
        periods,
        periodId,
        getJstToday(),
      );
      if (selectedId == null) {
        dependencies.selectEmpty();
        dependencies.publishSummary(null);
        return;
      }
      yield* dependencies.refreshSummary(selectedId);
    });
  }
  return refreshOnResumeEffect;
}
