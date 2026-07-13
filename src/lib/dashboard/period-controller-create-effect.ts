import { Effect } from "effect";
import { periodsUrl } from "$lib/dashboard/api-urls";
import type { PeriodOption } from "$lib/dashboard/controller-types";
import { addDays } from "$lib/dashboard/date";
import { fetchJsonEffect } from "$lib/dashboard/fetch-json";
import type { PeriodCreateResponse } from "$lib/dashboard/types";
import { parseNonNegativeIntegerYenInput } from "$lib/dashboard/yen-input";

type PeriodCreationDependencies = {
  readonly getBudgetInput: () => string;
  readonly getEndDate: () => string;
  readonly getPeriodId: () => string;
  readonly getPeriods: () => PeriodOption[];
  readonly getStartDate: () => string;
  readonly refreshPeriodListEffect: (
    _preferredPeriodId: string,
  ) => Effect.Effect<void, string>;
  readonly setError: (_error: string | null) => void;
  readonly setSaving: (_saving: boolean) => void;
};

export function createInitialPeriodEffect(
  dependencies: PeriodCreationDependencies,
): Effect.Effect<void, never> {
  const budgetYen = parseNonNegativeIntegerYenInput(
    dependencies.getBudgetInput(),
  );
  if (budgetYen == null) {
    dependencies.setError("予算は 0 以上の整数で入力してください。");
    return Effect.void;
  }
  return Effect.gen(function* () {
    dependencies.setSaving(true);
    dependencies.setError(null);
    const periods = dependencies.getPeriods();
    const startDate = dependencies.getStartDate();
    const latestPeriod = periods[periods.length - 1] ?? null;
    const predecessorPeriodId =
      latestPeriod != null && addDays(latestPeriod.endDate, 1) === startDate
        ? latestPeriod.id
        : null;
    const result = yield* fetchJsonEffect<PeriodCreateResponse>(
      periodsUrl(),
      {
        body: JSON.stringify({
          budgetYen,
          endDate: dependencies.getEndDate(),
          id: dependencies.getPeriodId(),
          predecessorPeriodId,
          startDate,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
      "期間作成に失敗しました。",
    ).pipe(Effect.either);
    if (result._tag === "Left") {
      dependencies.setError(result.left);
    } else {
      const refreshResult = yield* dependencies
        .refreshPeriodListEffect(result.right.id)
        .pipe(Effect.either);
      if (refreshResult._tag === "Left") {
        dependencies.setError(refreshResult.left);
      }
    }
    dependencies.setSaving(false);
  });
}
