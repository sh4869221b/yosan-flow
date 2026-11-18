import { json, type RequestHandler } from "@sveltejs/kit";
import type { TracingAdapter } from "#lib/server/observability/tracing.ts";
import { getRequestTracing } from "#lib/server/observability/tracing-workers.ts";
import {
  observeMutationInitialization,
  runMutationResponse,
} from "#lib/server/observability/mutation-response.ts";
import { runApiEffect } from "#lib/server/effect/runtime.ts";
import {
  getApiServices,
  getPeriodSummaryFromServices,
  type InMemoryApiServices,
} from "#lib/server/services/month-summary-service.ts";
import {
  parseDate,
  parseDayEntryKey,
  parseDayMutationInput,
} from "#lib/server/validation/day.ts";
import { parsePeriodPathId } from "#lib/server/validation/month.ts";

type Mode = "add" | "overwrite";
export type DayEntrySaveDependencies = {
  services: InMemoryApiServices;
  tracing?: TracingAdapter;
};

async function savedResponse(
  dependencies: DayEntrySaveDependencies,
  periodId: string,
) {
  try {
    const summary = await runApiEffect(
      getPeriodSummaryFromServices(
        dependencies.services,
        periodId,
        dependencies.tracing,
      ),
    );
    return json(summary);
  } catch {
    // A successful write stays acknowledged when the client needs a separate GET.
    return new Response(null, { status: 204 });
  }
}

export function createDayEntrySaveHandler(
  mode: Mode,
  dependencies: DayEntrySaveDependencies,
): RequestHandler {
  const command = mode === "add" ? "addDailyAmount" : "overwriteDailyAmount";
  return async ({ params, request }) =>
    runMutationResponse(
      `day.${mode}`,
      async () => {
        const periodId = parsePeriodPathId(params.periodId, request);
        const date = parseDate(params.date);
        const input = await runApiEffect(parseDayMutationInput(request));
        await runApiEffect(
          dependencies.services.dayEntryService[command]({
            periodId,
            date,
            ...input,
            idempotencyKey: parseDayEntryKey(request),
          }),
        );
        return { response: await savedResponse(dependencies, periodId) };
      },
      dependencies.tracing,
    );
}

export function runDayEntrySave(
  mode: Mode,
  event: Parameters<RequestHandler>[0],
): ReturnType<RequestHandler> {
  return createDayEntrySaveHandler(mode, {
    services: observeMutationInitialization(`day.${mode}`, () =>
      getApiServices(),
    ),
    tracing: getRequestTracing(),
  })(event);
}
