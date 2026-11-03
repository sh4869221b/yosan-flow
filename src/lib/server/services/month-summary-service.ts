import { Effect, Fiber } from "effect";
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

export type { PeriodSummary } from "#lib/server/services/period-summary/period-summary-calculator.ts";

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
      return calculatePeriodSummary(period, { jstToday, dailyTotals });
    }),
    () => ({ "app.operation": "summary.calculate" }),
  );
}
