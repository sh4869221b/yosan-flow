import { json, type RequestHandler } from "@sveltejs/kit";
import {
  buildMonthSummary,
  getApiServicesFromPlatform,
  type InMemoryApiServices
} from "$lib/server/services/month-summary-service";
import {
  assertDateInYearMonth,
  parseDate,
  parseDayMutationInput,
  yearMonthOfDate
} from "$lib/server/validation/day";
import { toApiErrorResponse } from "$lib/server/validation/month";

export type DayAddRouteDependencies = {
  services: InMemoryApiServices;
};

export function _createDayAddHandler(dependencies: DayAddRouteDependencies): RequestHandler {
  return async ({ params, request }) => {
    try {
      const date = parseDate(params.date);
      const input = await parseDayMutationInput(request);

      if (input.yearMonth) {
        assertDateInYearMonth(date, input.yearMonth);
      }

      await dependencies.services.dayEntryService.addDailyAmount({
        date,
        inputYen: input.inputYen,
        memo: input.memo
      });

      const yearMonth = yearMonthOfDate(date);
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

export const POST: RequestHandler = async (event) => {
  return _createDayAddHandler({
    services: getApiServicesFromPlatform(event.platform)
  })(event);
};
