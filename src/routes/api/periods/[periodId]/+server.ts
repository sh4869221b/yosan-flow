import { json, type RequestHandler } from "@sveltejs/kit";
import { runApiEffect, toEffectError } from "$lib/server/effect/runtime";
import {
  getApiServicesFromPlatform,
  getPeriodSummaryFromServices,
  type InMemoryApiServices,
} from "$lib/server/services/month-summary-service";
import {
  parsePeriodId,
  parseRequestBodyObject,
  toApiErrorResponse,
} from "$lib/server/validation/month";
import { parsePeriodUpdateRequest } from "$lib/server/validation/period-update";
import { PERIOD_BOUNDARY_CONFIRMATION_REQUIRED_ERROR } from "$lib/server/services/period-update/period-update-types";

export type PeriodRouteDependencies = {
  services: InMemoryApiServices;
};

export function _createPeriodGetHandler(
  dependencies: PeriodRouteDependencies,
): RequestHandler {
  return async ({ params }) => {
    try {
      const periodId = parsePeriodId(params.periodId);
      const summary = await runApiEffect(
        getPeriodSummaryFromServices(dependencies.services, periodId),
      );
      return json(summary);
    } catch (error) {
      if (!(error instanceof Error)) {
        return toApiErrorResponse(toEffectError(error));
      }
      return toApiErrorResponse(error);
    }
  };
}

export const GET: RequestHandler = async (event) => {
  return _createPeriodGetHandler({
    services: getApiServicesFromPlatform(event.platform),
  })(event);
};

export function _createPeriodPutHandler(
  dependencies: PeriodRouteDependencies,
): RequestHandler {
  return async ({ params, request }) => {
    try {
      const periodId = parsePeriodId(params.periodId);
      const body = await runApiEffect(parseRequestBodyObject(request));
      const updateRequest = parsePeriodUpdateRequest(body);

      const result = await runApiEffect(
        dependencies.services.updatePeriod(periodId, updateRequest),
      );
      switch (result.kind) {
        case "confirmation-required":
          return json(
            {
              error: PERIOD_BOUNDARY_CONFIRMATION_REQUIRED_ERROR,
              proposal: result.proposal,
            },
            { status: 409 },
          );
        case "updated": {
          const summary = await runApiEffect(
            getPeriodSummaryFromServices(dependencies.services, periodId),
          );
          return json(summary);
        }
      }
    } catch (error) {
      if (!(error instanceof Error)) {
        return toApiErrorResponse(toEffectError(error));
      }
      return toApiErrorResponse(error);
    }
  };
}

export const PUT: RequestHandler = async (event) => {
  return _createPeriodPutHandler({
    services: getApiServicesFromPlatform(event.platform),
  })(event);
};
