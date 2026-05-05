import { json, type RequestHandler } from "@sveltejs/kit";
import {
  getApiServicesFromPlatform,
  type InMemoryApiServices,
} from "$lib/server/services/month-summary-service";
import { parseDate } from "$lib/server/validation/day";
import {
  parsePeriodId,
  toApiErrorResponse,
} from "$lib/server/validation/month";

export type PeriodDayHistoryRouteDependencies = {
  services: InMemoryApiServices;
};

export function _createPeriodDayHistoryHandler(
  dependencies: PeriodDayHistoryRouteDependencies,
): RequestHandler {
  return async ({ params }) => {
    try {
      const periodId = parsePeriodId(params.periodId);
      const date = parseDate(params.date);
      const histories = await dependencies.services.listHistoryByDate(
        periodId,
        date,
      );

      return json({
        periodId,
        date,
        histories,
      });
    } catch (error) {
      return toApiErrorResponse(error);
    }
  };
}

export const GET: RequestHandler = async (event) => {
  return _createPeriodDayHistoryHandler({
    services: getApiServicesFromPlatform(event.platform),
  })(event);
};
