import { json, type RequestHandler } from "@sveltejs/kit";
import { runApiEffect } from "$lib/server/effect/runtime";
import {
  getApiServicesFromPlatform,
  getPeriodSummaryFromServices,
  type InMemoryApiServices,
} from "$lib/server/services/month-summary-service";
import {
  parseDate,
  parseDayMutationInput,
  parseHistoryId,
} from "$lib/server/validation/day";
import {
  parsePeriodId,
  toApiErrorResponse,
} from "$lib/server/validation/month";

export type PeriodDayHistoryMutationRouteDependencies = {
  services: InMemoryApiServices;
};

async function buildHistoryMutationResponse(
  services: InMemoryApiServices,
  periodId: string,
  date: string,
): Promise<Response> {
  const [summary, histories] = await Promise.all([
    runApiEffect(getPeriodSummaryFromServices(services, periodId)),
    runApiEffect(services.listHistoryByDate(periodId, date)),
  ]);
  return json({
    summary,
    histories,
  });
}

export function _createPeriodDayHistoryMutationHandler(
  dependencies: PeriodDayHistoryMutationRouteDependencies,
): {
  PATCH: RequestHandler;
  DELETE: RequestHandler;
} {
  return {
    PATCH: async ({ params, request }) => {
      try {
        const periodId = parsePeriodId(params.periodId);
        const date = parseDate(params.date);
        const historyId = parseHistoryId(params.historyId);
        const input = await runApiEffect(parseDayMutationInput(request));

        await runApiEffect(
          dependencies.services.dayEntryService.updateHistoryEntry({
            periodId,
            date,
            historyId,
            inputYen: input.inputYen,
            memo: input.memo,
          }),
        );

        return await buildHistoryMutationResponse(
          dependencies.services,
          periodId,
          date,
        );
      } catch (error) {
        return toApiErrorResponse(error);
      }
    },

    DELETE: async ({ params }) => {
      try {
        const periodId = parsePeriodId(params.periodId);
        const date = parseDate(params.date);
        const historyId = parseHistoryId(params.historyId);

        await runApiEffect(
          dependencies.services.dayEntryService.deleteHistoryEntry({
            periodId,
            date,
            historyId,
          }),
        );

        return await buildHistoryMutationResponse(
          dependencies.services,
          periodId,
          date,
        );
      } catch (error) {
        return toApiErrorResponse(error);
      }
    },
  };
}

export const PATCH: RequestHandler = async (event) => {
  return _createPeriodDayHistoryMutationHandler({
    services: getApiServicesFromPlatform(event.platform),
  }).PATCH(event);
};

export const DELETE: RequestHandler = async (event) => {
  return _createPeriodDayHistoryMutationHandler({
    services: getApiServicesFromPlatform(event.platform),
  }).DELETE(event);
};
