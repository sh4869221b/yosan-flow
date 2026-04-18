import { json, type RequestHandler } from "@sveltejs/kit";
import {
  getApiServicesFromPlatform,
  type InMemoryApiServices
} from "$lib/server/services/month-summary-service";
import { parseDate } from "$lib/server/validation/day";
import { toApiErrorResponse } from "$lib/server/validation/month";

export type DayHistoryRouteDependencies = {
  services: InMemoryApiServices;
};

export function createDayHistoryHandler(dependencies: DayHistoryRouteDependencies): RequestHandler {
  return async ({ params }) => {
    try {
      const date = parseDate(params.date);
      const histories = await dependencies.services.listHistoryByDate(date);

      return json({
        date,
        histories
      });
    } catch (error) {
      return toApiErrorResponse(error);
    }
  };
}

export const GET: RequestHandler = async (event) => {
  return createDayHistoryHandler({
    services: getApiServicesFromPlatform(event.platform)
  })(event);
};
