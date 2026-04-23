import { json, type RequestHandler } from "@sveltejs/kit";
import {
  getApiServicesFromPlatform,
  getPeriodSummaryFromServices,
  type InMemoryApiServices
} from "$lib/server/services/month-summary-service";
import {
  parseNonNegativeIntegerYen,
  parsePeriodId,
  parseRequestBodyObject,
  toApiErrorResponse
} from "$lib/server/validation/month";
import { parseDate } from "$lib/server/validation/day";

export type PeriodRouteDependencies = {
  services: InMemoryApiServices;
};

export function _createPeriodGetHandler(dependencies: PeriodRouteDependencies): RequestHandler {
  return async ({ params }) => {
    try {
      const periodId = parsePeriodId(params.periodId);
      const summary = await getPeriodSummaryFromServices(dependencies.services, periodId);
      return json(summary);
    } catch (error) {
      return toApiErrorResponse(error);
    }
  };
}

export const GET: RequestHandler = async (event) => {
  return _createPeriodGetHandler({
    services: getApiServicesFromPlatform(event.platform)
  })(event);
};

export function _createPeriodPutHandler(dependencies: PeriodRouteDependencies): RequestHandler {
  return async ({ params, request }) => {
    try {
      const periodId = parsePeriodId(params.periodId);
      const body = await parseRequestBodyObject(request);
      const startDate = parseDate(body.startDate as string | undefined);
      const endDate = parseDate(body.endDate as string | undefined);
      const budgetYen = parseNonNegativeIntegerYen(body.budgetYen, "budgetYen");

      await dependencies.services.updatePeriod({
        id: periodId,
        startDate,
        endDate,
        budgetYen
      });

      const summary = await getPeriodSummaryFromServices(dependencies.services, periodId);
      return json(summary);
    } catch (error) {
      return toApiErrorResponse(error);
    }
  };
}

export const PUT: RequestHandler = async (event) => {
  return _createPeriodPutHandler({
    services: getApiServicesFromPlatform(event.platform)
  })(event);
};
