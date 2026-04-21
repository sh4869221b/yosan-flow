import { json, type RequestHandler } from "@sveltejs/kit";
import {
  buildMonthSummary,
  getApiServicesFromPlatform,
  type InMemoryApiServices
} from "$lib/server/services/month-summary-service";
import { parseYearMonth, toApiErrorResponse } from "$lib/server/validation/month";

export type MonthRouteDependencies = {
  services: InMemoryApiServices;
};

export function _createMonthGetHandler(dependencies: MonthRouteDependencies): RequestHandler {
  return async ({ params }) => {
    try {
      const yearMonth = parseYearMonth(params.yearMonth);
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

export const GET: RequestHandler = async (event) => {
  return _createMonthGetHandler({
    services: getApiServicesFromPlatform(event.platform)
  })(event);
};
