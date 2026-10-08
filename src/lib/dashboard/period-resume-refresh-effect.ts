import { Effect } from "effect";
import { PERIODS_URL } from "#lib/dashboard/api-urls.ts";
import { getJstToday } from "#lib/dashboard/date.ts";
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
  readonly setPeriods: (_value: PeriodOption[]) => void;
  readonly selectEmpty: () => void;
  readonly refreshSummary: (_periodId: string) => Effect.Effect<void, never>;
};

function selectResumePeriod(
  periods: readonly PeriodOption[],
  preferredPeriodId: string | null,
  today: string,
): PeriodOption | null {
  return (
    periods.find((period) => period.id === preferredPeriodId) ??
    periods.find(
      (period) =>
        period.status === "active" &&
        period.startDate <= today &&
        today <= period.endDate,
    ) ??
    periods.at(-1) ??
    null
  );
}

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
      const selected = selectResumePeriod(periods, periodId, getJstToday());
      if (selected == null) {
        dependencies.selectEmpty();
        dependencies.publishSummary(null);
        return;
      }
      yield* dependencies.refreshSummary(selected.id);
    });
  }
  return refreshOnResumeEffect;
}
