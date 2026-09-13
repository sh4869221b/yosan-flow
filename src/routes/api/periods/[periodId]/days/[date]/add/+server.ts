import { json, type RequestHandler } from "@sveltejs/kit";
import { runApiEffect } from "$lib/server/effect/runtime";
import {
  observeMutationInitialization,
  runMutationResponse,
} from "$lib/server/observability/mutation-response";
import {
  getApiServicesFromPlatform,
  getPeriodSummaryFromServices,
  type InMemoryApiServices,
} from "$lib/server/services/month-summary-service";
import { parseDate, parseDayMutationInput } from "$lib/server/validation/day";
import { parsePeriodId } from "$lib/server/validation/month";

export type PeriodDayAddRouteDependencies = {
  services: InMemoryApiServices;
};

export function _createPeriodDayAddHandler(
  dependencies: PeriodDayAddRouteDependencies,
): RequestHandler {
  return async ({ params, request }) =>
    runMutationResponse("day.add", async () => {
      const periodId = parsePeriodId(params.periodId);
      const date = parseDate(params.date);
      const input = await runApiEffect(parseDayMutationInput(request));

      await runApiEffect(
        dependencies.services.dayEntryService.addDailyAmount({
          periodId,
          date,
          inputYen: input.inputYen,
          memo: input.memo,
        }),
      );

      const summary = await runApiEffect(
        getPeriodSummaryFromServices(dependencies.services, periodId),
      );
      return { response: json(summary) };
    });
}

export const POST: RequestHandler = async (event) => {
  return _createPeriodDayAddHandler({
    services: observeMutationInitialization("day.add", () =>
      getApiServicesFromPlatform(event.platform),
    ),
  })(event);
};
