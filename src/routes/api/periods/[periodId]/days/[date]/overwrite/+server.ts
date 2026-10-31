import { json, type RequestHandler } from "@sveltejs/kit";
import type { TracingAdapter } from "#lib/server/observability/tracing.ts";
import { getRequestTracing } from "#lib/server/observability/tracing-workers.ts";
import { runApiEffect } from "#lib/server/effect/runtime.ts";
import {
  observeMutationInitialization,
  runMutationResponse,
} from "#lib/server/observability/mutation-response.ts";
import {
  getApiServices,
  getPeriodSummaryFromServices,
  type InMemoryApiServices,
} from "#lib/server/services/month-summary-service.ts";
import {
  parseDate,
  parseDayMutationInput,
} from "#lib/server/validation/day.ts";
import { parsePeriodId } from "#lib/server/validation/month.ts";

export type PeriodDayOverwriteRouteDependencies = {
  services: InMemoryApiServices;
  tracing?: TracingAdapter;
};

export function _createPeriodDayOverwriteHandler(
  dependencies: PeriodDayOverwriteRouteDependencies,
): RequestHandler {
  return async ({ params, request }) =>
    runMutationResponse(
      "day.overwrite",
      async () => {
        const periodId = parsePeriodId(params.periodId);
        const date = parseDate(params.date);
        const input = await runApiEffect(parseDayMutationInput(request));

        await runApiEffect(
          dependencies.services.dayEntryService.overwriteDailyAmount({
            periodId,
            date,
            inputYen: input.inputYen,
            memo: input.memo,
          }),
        );

        const summary = await runApiEffect(
          getPeriodSummaryFromServices(
            dependencies.services,
            periodId,
            dependencies.tracing,
          ),
        );
        return { response: json(summary) };
      },
      dependencies.tracing,
    );
}

export const PUT: RequestHandler = async (event) => {
  return _createPeriodDayOverwriteHandler({
    services: observeMutationInitialization("day.overwrite", () =>
      getApiServices(),
    ),
    tracing: getRequestTracing(),
  })(event);
};
