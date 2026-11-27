import { Effect, Fiber } from "effect";
import { YenTotalOutOfRangeError } from "#lib/server/domain/yen.ts";
import { toEffectError } from "#lib/server/effect/runtime.ts";
import {
  noopTracing,
  type TracingAdapter,
} from "#lib/server/observability/tracing.ts";
import { withTracingEffect } from "#lib/server/observability/tracing-effect.ts";
import type { InMemoryApiServices } from "#lib/server/services/api-services/types.ts";
import type { PeriodSummary } from "#lib/server/services/period-summary/period-summary-calculator.ts";
import {
  calculatePeriodSummary,
  PeriodNotFoundError,
} from "#lib/server/services/period-summary/period-summary-calculator.ts";

export { getApiServices } from "#lib/server/services/api-services/cache.ts";
export type { InMemoryApiServices } from "#lib/server/services/api-services/types.ts";

export function getDisplayPeriodSummary(
  services: InMemoryApiServices,
  periodId: string,
  tracing: TracingAdapter = noopTracing,
) {
  return getPeriodSummaryFromServices(services, periodId, tracing).pipe(
    Effect.map((summary) => ({ summary })),
    Effect.catchIf(
      (error) => error instanceof YenTotalOutOfRangeError,
      () =>
        Effect.succeed({
          summary: null,
          summaryError: {
            code: "YEN_TOTAL_OUT_OF_RANGE",
            message:
              "この期間の支出合計が上限を超えているため、集計を表示できません。",
          },
        }),
    ),
  );
}

export function getPeriodSummaryFromServices(
  services: InMemoryApiServices,
  periodId: string,
  tracing: TracingAdapter = noopTracing,
): Effect.Effect<PeriodSummary, Error> {
  return withTracingEffect(
    tracing,
    "summary.calculate",
    Effect.gen(function* () {
      // Speculate only the independent period read. Capturing its error keeps
      // totals-first failure precedence; the parent owns/cancels the child.
      const periodRead = yield* Effect.forkChild(
        Effect.result(services.budgetPeriodRepository.findById(periodId)),
      );
      const dailyTotals = yield* services.listDailyTotalsByPeriodId(periodId);
      const jstToday = services.jstToday();
      const period = yield* Effect.fromResult(yield* Fiber.join(periodRead));
      if (!period) {
        return yield* Effect.fail(new PeriodNotFoundError(periodId));
      }
      return yield* Effect.try({
        try: () => calculatePeriodSummary(period, { jstToday, dailyTotals }),
        catch: toEffectError,
      });
    }),
    () => ({ "app.operation": "summary.calculate" }),
  );
}
