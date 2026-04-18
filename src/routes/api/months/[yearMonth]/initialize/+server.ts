import { json, type RequestHandler } from "@sveltejs/kit";
import {
  buildMonthSummary,
  getDefaultInMemoryApiServices,
  initializeMonthExplicit,
  type InMemoryApiServices
} from "$lib/server/services/month-summary-service";
import {
  parseOptionalBudgetYen,
  parseRequestBodyObject,
  parseYearMonth,
  toApiErrorResponse
} from "$lib/server/validation/month";

export type MonthInitializeRouteDependencies = {
  services: InMemoryApiServices;
};

export function createMonthInitializeHandler(
  dependencies: MonthInitializeRouteDependencies
): RequestHandler {
  return async ({ params, request }) => {
    try {
      const yearMonth = parseYearMonth(params.yearMonth);
      const body = await parseRequestBodyObject(request);
      const budgetYen = parseOptionalBudgetYen(body);

      await initializeMonthExplicit(dependencies.services.monthRepository, {
        yearMonth,
        budgetYen,
        nowIso: dependencies.services.nowIso()
      });

      const summary = await buildMonthSummary(dependencies.services.monthRepository, yearMonth, {
        jstToday: dependencies.services.jstToday(),
        dailyTotals: await dependencies.services.listDailyTotalsByYearMonth(yearMonth)
      });

      return json(summary);
    } catch (error) {
      return toApiErrorResponse(error);
    }
  };
}

export const POST = createMonthInitializeHandler({
  services: getDefaultInMemoryApiServices()
});
