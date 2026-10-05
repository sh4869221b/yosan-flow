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
  parseHistoryId,
} from "#lib/server/validation/day.ts";
import { parsePeriodId } from "#lib/server/validation/month.ts";

export type PeriodDayHistoryMutationRouteDependencies = {
  services: InMemoryApiServices;
  tracing?: TracingAdapter;
};

async function buildHistoryMutationResponse(
  services: InMemoryApiServices,
  periodId: string,
  date: string,
  tracing?: TracingAdapter,
): Promise<Response> {
  const [summary, histories] = await Promise.all([
    runApiEffect(getPeriodSummaryFromServices(services, periodId, tracing)),
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
    PATCH: async ({ params, request }) =>
      runMutationResponse(
        "history.update",
        async () => {
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

          return {
            response: await buildHistoryMutationResponse(
              dependencies.services,
              periodId,
              date,
              dependencies.tracing,
            ),
          };
        },
        dependencies.tracing,
      ),

    DELETE: async ({ params }) =>
      runMutationResponse(
        "history.delete",
        async () => {
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

          return {
            response: await buildHistoryMutationResponse(
              dependencies.services,
              periodId,
              date,
              dependencies.tracing,
            ),
          };
        },
        dependencies.tracing,
      ),
  };
}

export const PATCH: RequestHandler = async (event) => {
  return _createPeriodDayHistoryMutationHandler({
    services: observeMutationInitialization("history.update", () =>
      getApiServices(),
    ),
    tracing: getRequestTracing(),
  }).PATCH(event);
};

export const DELETE: RequestHandler = async (event) => {
  return _createPeriodDayHistoryMutationHandler({
    services: observeMutationInitialization("history.delete", () =>
      getApiServices(),
    ),
    tracing: getRequestTracing(),
  }).DELETE(event);
};
