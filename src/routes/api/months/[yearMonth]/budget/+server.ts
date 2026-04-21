import { json, type RequestHandler } from "@sveltejs/kit";
import {
  buildMonthSummary,
  getApiServicesFromPlatform,
  upsertMonthBudget,
  type InMemoryApiServices
} from "$lib/server/services/month-summary-service";
import {
  parseBudgetYen,
  parseRequestBodyObject,
  parseYearMonth,
  toApiErrorResponse
} from "$lib/server/validation/month";

export type MonthBudgetRouteDependencies = {
  services: InMemoryApiServices;
};

export function _createMonthBudgetHandler(dependencies: MonthBudgetRouteDependencies): RequestHandler {
  return async ({ params, request }) => {
    try {
      const yearMonth = parseYearMonth(params.yearMonth);
      const body = await parseRequestBodyObject(request);
      const budgetYen = parseBudgetYen(body);

      await upsertMonthBudget(dependencies.services.monthRepository, {
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

export const PUT: RequestHandler = async (event) => {
  return _createMonthBudgetHandler({
    services: getApiServicesFromPlatform(event.platform)
  })(event);
};
