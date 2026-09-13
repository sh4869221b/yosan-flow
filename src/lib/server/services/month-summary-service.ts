import { Effect } from "effect";
import {
  noopTracing,
  type TracingAdapter,
} from "$lib/server/observability/tracing";
import { withTracingEffect } from "$lib/server/observability/tracing-effect";
import type { InMemoryApiServices } from "$lib/server/services/api-services/types";
import type { PeriodSummary } from "$lib/server/services/period-summary/period-summary-calculator";
import { buildPeriodSummary } from "$lib/server/services/period-summary/period-summary-calculator";

export { getApiServicesFromPlatform } from "$lib/server/services/api-services/cache";
export { createD1ApiServices } from "$lib/server/services/api-services/d1";
export { createInMemoryApiServices } from "$lib/server/services/api-services/in-memory";
export type { InMemoryApiServices } from "$lib/server/services/api-services/types";

export { buildPeriodSummary } from "$lib/server/services/period-summary/period-summary-calculator";
export type { PeriodSummary } from "$lib/server/services/period-summary/period-summary-calculator";

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
