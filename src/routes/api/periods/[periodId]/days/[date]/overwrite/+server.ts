import { json, type RequestHandler } from "@sveltejs/kit";
import {
  getApiServicesFromPlatform,
  getPeriodSummaryFromServices,
  type InMemoryApiServices,
} from "$lib/server/services/month-summary-service";
import { parseDate, parseDayMutationInput } from "$lib/server/validation/day";
import {
  parsePeriodId,
  toApiErrorResponse,
} from "$lib/server/validation/month";

export type PeriodDayOverwriteRouteDependencies = {
  services: InMemoryApiServices;
};

export function _createPeriodDayOverwriteHandler(
  dependencies: PeriodDayOverwriteRouteDependencies,
): RequestHandler {
  return async ({ params, request }) => {
    try {
      const periodId = parsePeriodId(params.periodId);
      const date = parseDate(params.date);
      const input = await parseDayMutationInput(request);

      await dependencies.services.dayEntryService.overwriteDailyAmount({
        periodId,
        date,
        inputYen: input.inputYen,
        memo: input.memo,
      });

      const summary = await getPeriodSummaryFromServices(
        dependencies.services,
        periodId,
      );
      return json(summary);
    } catch (error) {
      return toApiErrorResponse(error);
    }
  };
}

export const PUT: RequestHandler = async (event) => {
  return _createPeriodDayOverwriteHandler({
    services: getApiServicesFromPlatform(event.platform),
  })(event);
};
