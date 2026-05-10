import { json, type RequestHandler } from "@sveltejs/kit";
import { runApiEffect } from "$lib/server/effect/runtime";
import {
  getApiServicesFromPlatform,
  type InMemoryApiServices,
} from "$lib/server/services/month-summary-service";
import {
  parseNonNegativeIntegerYen,
  parsePeriodId,
  parseRequestBodyObject,
  toApiErrorResponse,
} from "$lib/server/validation/month";
import { parseDate } from "$lib/server/validation/day";

export type PeriodsRouteDependencies = {
  services: InMemoryApiServices;
};

export function _createPeriodsHandler(
  dependencies: PeriodsRouteDependencies,
): RequestHandler {
  return async ({ request }) => {
    try {
      const body = await runApiEffect(parseRequestBodyObject(request));
      const id = parsePeriodId(body.id as string | undefined);
      const startDate = parseDate(body.startDate as string | undefined);
      const endDate = parseDate(body.endDate as string | undefined);
      const budgetYen = parseNonNegativeIntegerYen(body.budgetYen, "budgetYen");
      const predecessorPeriodId =
        body.predecessorPeriodId == null
          ? null
          : parsePeriodId(body.predecessorPeriodId as string);

      const period = await runApiEffect(
        dependencies.services.createPeriod({
          id,
          startDate,
          endDate,
          budgetYen,
          predecessorPeriodId,
        }),
      );

      return json(period, { status: 201 });
    } catch (error) {
      return toApiErrorResponse(error);
    }
  };
}

export function _createPeriodsListHandler(
  dependencies: PeriodsRouteDependencies,
): RequestHandler {
  return async () => {
    try {
      const periods = await runApiEffect(dependencies.services.listPeriods());
      return json({ periods });
    } catch (error) {
      return toApiErrorResponse(error);
    }
  };
}

export const POST: RequestHandler = async (event) => {
  return _createPeriodsHandler({
    services: getApiServicesFromPlatform(event.platform),
  })(event);
};

export const GET: RequestHandler = async (event) => {
  return _createPeriodsListHandler({
    services: getApiServicesFromPlatform(event.platform),
  })(event);
};
