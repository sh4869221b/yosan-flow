import { json, type RequestHandler } from "@sveltejs/kit";
import type { TracingAdapter } from "$lib/server/observability/tracing";
import { getRequestTracing } from "$lib/server/observability/tracing-platform";
import { runApiEffect, toEffectError } from "$lib/server/effect/runtime";
import {
  observeMutationInitialization,
  runMutationResponse,
} from "$lib/server/observability/mutation-response";
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
  tracing?: TracingAdapter;
};

export function _createPeriodGetHandler(
  dependencies: PeriodRouteDependencies,
): RequestHandler {
  return async ({ params }) => {
    try {
      const periodId = parsePeriodId(params.periodId);
      const summary = await runApiEffect(
        getPeriodSummaryFromServices(
          dependencies.services,
          periodId,
          dependencies.tracing,
        ),
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
    tracing: getRequestTracing(event.platform),
  })(event);
};

export function _createPeriodPutHandler(
  dependencies: PeriodRouteDependencies,
): RequestHandler {
  return async ({ params, request }) =>
    runMutationResponse(
      "period.update",
      async (context) => {
        try {
          const periodId = parsePeriodId(params.periodId);
          const body = await runApiEffect(parseRequestBodyObject(request));
          const updateRequest = parsePeriodUpdateRequest(body);
          if (updateRequest.confirmation !== undefined) {
            context.operation = "period.boundary.confirm";
          }

          const result = await runApiEffect(
            dependencies.services.updatePeriod(
              periodId,
              updateRequest,
              dependencies.tracing,
            ),
          );
          switch (result.kind) {
            case "confirmation-required":
              context.operation = "period.boundary.propose";
              return {
                errorCode: "PERIOD_BOUNDARY_CONFIRMATION_REQUIRED",
                response: json(
                  {
                    error: PERIOD_BOUNDARY_CONFIRMATION_REQUIRED_ERROR,
                    proposal: result.proposal,
                  },
                  { status: 409 },
                ),
              };
            case "updated": {
              const summary = await runApiEffect(
                getPeriodSummaryFromServices(
                  dependencies.services,
                  periodId,
                  dependencies.tracing,
                ),
              );
              return { response: json(summary) };
            }
          }
        } catch (error) {
          if (!(error instanceof Error)) {
            throw toEffectError(error);
          }
          throw error;
        }
      },
      dependencies.tracing,
    );
}

export const PUT: RequestHandler = async (event) => {
  return _createPeriodPutHandler({
    services: observeMutationInitialization("period.update", () =>
      getApiServicesFromPlatform(event.platform),
    ),
    tracing: getRequestTracing(event.platform),
  })(event);
};
