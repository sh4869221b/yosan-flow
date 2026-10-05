import { json, type RequestHandler } from "@sveltejs/kit";
import { runApiEffect } from "#lib/server/effect/runtime.ts";
import {
  getApiServices,
  type InMemoryApiServices,
} from "#lib/server/services/month-summary-service.ts";
import { parseDate } from "#lib/server/validation/day.ts";
import {
  parsePeriodId,
  toApiErrorResponse,
} from "#lib/server/validation/month.ts";

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
      const histories = await runApiEffect(
        dependencies.services.listHistoryByDate(periodId, date),
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
    services: getApiServices(),
  })(event);
};
