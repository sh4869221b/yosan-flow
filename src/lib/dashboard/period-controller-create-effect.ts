import { Effect } from "effect";
import { periodSummaryUrl, PERIODS_URL } from "#lib/dashboard/api-urls.ts";
import type {
  PeriodOption,
  PeriodSummary,
} from "#lib/dashboard/controller-types.ts";
import { addDays } from "#lib/dashboard/date.ts";
import { fetchJsonEffect } from "#lib/dashboard/fetch-json.ts";
import type { createPeriodSummaryRequestTracker } from "#lib/dashboard/period-summary-request-tracker.ts";
import type { PeriodSummaryRevision } from "#lib/dashboard/period-summary-revision.ts";
import type {
  PeriodCreateResponse,
  PeriodListResponse,
} from "#lib/dashboard/types.ts";
import { parseNonNegativeIntegerYenInput } from "#lib/dashboard/yen-input.ts";
import type { PeriodCreateState } from "#lib/dashboard/period-create-state.svelte.ts";

export type PeriodCreationDependencies = {
  readonly createState: PeriodCreateState;
  readonly getPeriods: () => PeriodOption[];
  readonly getSelectedPeriodId: () => string | null;
  readonly publishSummary: (_summary: PeriodSummary) => void;
  readonly setPeriods: (_periods: PeriodOption[]) => void;
  readonly setSummaryLoading: (_loading: boolean) => void;
  readonly summaryRequests: ReturnType<
    typeof createPeriodSummaryRequestTracker
  >;
  readonly summaryRevision: PeriodSummaryRevision;
};

type RecoveryOutcome =
  | Readonly<{ kind: "published" }>
  | Readonly<{ kind: "failed"; error: string }>
  | Readonly<{ kind: "stale" }>;

function refreshCreatedPeriodEffect(
  dependencies: PeriodCreationDependencies,
  periodId: string,
): Effect.Effect<RecoveryOutcome, never> {
  const request = dependencies.summaryRequests.start(periodId);
  dependencies.setSummaryLoading(false);
  return Effect.gen(function* () {
    if (request.mutationWasActive) {
      yield* dependencies.summaryRevision.awaitMutationSettlement(
        periodId,
        request.mutationSequence,
      );
      if (!dependencies.summaryRequests.owns(request)) {
        return { kind: "stale" } as const;
      }
      return yield* refreshCreatedPeriodEffect(dependencies, periodId);
    }
    const listResult = yield* fetchJsonEffect<PeriodListResponse<PeriodOption>>(
      PERIODS_URL,
      undefined,
      "保存に失敗しました。",
    ).pipe(Effect.result);
    if (!dependencies.summaryRequests.owns(request)) {
      return { kind: "stale" } as const;
    }
    if (listResult._tag === "Failure") {
      return { kind: "failed", error: listResult.failure } as const;
    }
    const periods = listResult.success.periods ?? [];
    dependencies.setPeriods(periods);
    if (!periods.some((period) => period.id === periodId)) {
      return {
        kind: "failed",
        error: "作成した期間の再取得に失敗しました。",
      } as const;
    }
    dependencies.setSummaryLoading(true);
    const summaryResult = yield* fetchJsonEffect<PeriodSummary>(
      periodSummaryUrl(periodId),
      undefined,
      "再取得に失敗しました。",
    ).pipe(Effect.result);
    if (!dependencies.summaryRequests.isFresh(request)) {
      return { kind: "stale" } as const;
    }
    if (summaryResult._tag === "Failure") {
      return { kind: "failed", error: summaryResult.failure } as const;
    }
    if (summaryResult.success.periodId !== periodId) {
      return {
        kind: "failed",
        error: "作成した期間の再取得に失敗しました。",
      } as const;
    }
    dependencies.publishSummary(summaryResult.success);
    return { kind: "published" } as const;
  }).pipe(
    Effect.ensuring(
      Effect.sync(() => {
        if (dependencies.summaryRequests.owns(request)) {
          dependencies.setSummaryLoading(false);
        }
      }),
    ),
  );
}

export function createPeriodRecoveryEffect(
  dependencies: PeriodCreationDependencies,
): Effect.Effect<void, never> {
  const periodId = dependencies.createState.createdPeriodId;
  if (periodId == null || !dependencies.createState.createdRefreshPending) {
    dependencies.createState.setCreatedRefreshing(false);
    return Effect.void;
  }
  dependencies.createState.setError(null);
  return refreshCreatedPeriodEffect(dependencies, periodId).pipe(
    Effect.tap((outcome) =>
      Effect.sync(() => {
        switch (outcome.kind) {
          case "published":
            dependencies.createState.completeCreatedRefresh(periodId);
            dependencies.createState.setError(null);
            return;
          case "failed":
            dependencies.createState.setError(outcome.error);
            return;
          case "stale":
            return;
          default: {
            const exhaustive: never = outcome;
            return exhaustive;
          }
        }
      }),
    ),
    Effect.asVoid,
    Effect.ensuring(
      Effect.sync(() => dependencies.createState.setCreatedRefreshing(false)),
    ),
  );
}

export function createPeriodCreationEffect(
  dependencies: PeriodCreationDependencies,
): Effect.Effect<void, never> {
  const createState = dependencies.createState;
  const budgetYen = parseNonNegativeIntegerYenInput(
    createState.createBudgetInput,
  );
  if (budgetYen == null) {
    createState.setError("予算は 0 以上の整数で入力してください。");
    createState.setSaving(false);
    return Effect.void;
  }
  const periods = dependencies.getPeriods();
  const startDate = createState.createStartDate;
  const latestPeriod = periods[periods.length - 1] ?? null;
  const predecessorPeriodId =
    latestPeriod != null && addDays(latestPeriod.endDate, 1) === startDate
      ? latestPeriod.id
      : null;
  const request = dependencies.summaryRequests.start(
    dependencies.getSelectedPeriodId(),
  );
  dependencies.setSummaryLoading(false);
  createState.setError(null);
  const post = fetchJsonEffect<PeriodCreateResponse>(
    PERIODS_URL,
    {
      body: JSON.stringify({
        budgetYen,
        endDate: createState.createEndDate,
        id: createState.createPeriodId,
        predecessorPeriodId,
        startDate,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
    "期間作成に失敗しました。",
  ).pipe(
    Effect.result,
    Effect.ensuring(Effect.sync(() => createState.setSaving(false))),
  );
  return Effect.gen(function* () {
    const result = yield* post;
    if (result._tag === "Failure") {
      if (dependencies.summaryRequests.owns(request)) {
        createState.setError(result.failure);
      }
      return;
    }
    const periodId = result.success.id;
    createState.retainCreatedPeriod(periodId);
    if (!dependencies.summaryRequests.owns(request)) return;
    createState.setCreatedRefreshing(true);
    yield* createPeriodRecoveryEffect(dependencies);
  });
}
