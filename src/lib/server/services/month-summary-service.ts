import { Effect } from "effect";
import {
  noopTracing,
  type TracingAdapter,
} from "#lib/server/observability/tracing.ts";
import { withTracingEffect } from "#lib/server/observability/tracing-effect.ts";
import type { InMemoryApiServices } from "#lib/server/services/api-services/types.ts";
import type { PeriodSummary } from "#lib/server/services/period-summary/period-summary-calculator.ts";
import { buildPeriodSummary } from "#lib/server/services/period-summary/period-summary-calculator.ts";

export { getApiServices } from "#lib/server/services/api-services/cache.ts";
export { createD1ApiServices } from "#lib/server/services/api-services/d1.ts";
export { createInMemoryApiServices } from "#lib/server/services/api-services/in-memory.ts";
export type { InMemoryApiServices } from "#lib/server/services/api-services/types.ts";

export { buildPeriodSummary } from "#lib/server/services/period-summary/period-summary-calculator.ts";
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
      const dailyTotals = yield* services.listDailyTotalsByPeriodId(periodId);
      return yield* buildPeriodSummary(
        services.budgetPeriodRepository,
        periodId,
        {
          jstToday: services.jstToday(),
          dailyTotals,
        },
      );
    }),
    () => ({ "app.operation": "summary.calculate" }),
  );
}
