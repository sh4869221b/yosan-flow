import { Effect } from "effect";
import type { InMemoryApiServices } from "$lib/server/services/api-services/types";
import type { PeriodSummary } from "$lib/server/services/period-summary/period-summary-calculator";
import { buildPeriodSummary } from "$lib/server/services/period-summary/period-summary-calculator";

export { getApiServicesFromPlatform } from "$lib/server/services/api-services/cache";
export { createD1ApiServices } from "$lib/server/services/api-services/d1";
export { createInMemoryApiServices } from "$lib/server/services/api-services/in-memory";
export type {
  CreateInMemoryApiServicesInput,
  DayEntryServicePort,
  InMemoryApiServices,
  InMemoryApiServicesWithInternals,
} from "$lib/server/services/api-services/types";

export { buildPeriodSummary } from "$lib/server/services/period-summary/period-summary-calculator";
export type {
  BuildPeriodSummaryOptions,
  PeriodSummary,
  PeriodSummaryDailyTotal,
} from "$lib/server/services/period-summary/period-summary-calculator";

export function getPeriodSummaryFromServices(
  services: InMemoryApiServices,
  periodId: string,
): Effect.Effect<PeriodSummary, Error> {
  return Effect.gen(function* () {
    const dailyTotals = yield* services.listDailyTotalsByPeriodId(periodId);
    return yield* buildPeriodSummary(
      services.budgetPeriodRepository,
      periodId,
      {
        jstToday: services.jstToday(),
        dailyTotals,
      },
    );
  });
}
