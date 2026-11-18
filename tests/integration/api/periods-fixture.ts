import { runApiEffect } from "#lib/server/effect/runtime.ts";
import type { RequestHandler } from "@sveltejs/kit";
import { createInMemoryApiServices } from "#lib/server/services/api-services/in-memory.ts";
import type { InMemoryApiServices } from "#lib/server/services/month-summary-service.ts";
import type { TracingAdapter } from "#lib/server/observability/tracing.ts";
import {
  _createPeriodsHandler,
  _createPeriodsListHandler,
} from "../../../src/routes/api/periods/+server";
import {
  _createPeriodGetHandler,
  _createPeriodPutHandler,
} from "../../../src/routes/api/periods/[periodId]/+server";
import { _createPeriodDayAddHandler } from "../../../src/routes/api/periods/[periodId]/days/[date]/add/+server";
import { _createPeriodDayOverwriteHandler } from "../../../src/routes/api/periods/[periodId]/days/[date]/overwrite/+server";
import { _createPeriodDayHistoryHandler } from "../../../src/routes/api/periods/[periodId]/days/[date]/history/+server";
import { _createPeriodDayHistoryMutationHandler } from "../../../src/routes/api/periods/[periodId]/days/[date]/history/[historyId]/+server";

export function createFixture(
  now = new Date("2026-04-20T00:00:00.000Z"),
  createHistoryId?: () => string,
  tracing?: TracingAdapter,
): {
  services: InMemoryApiServices;
  createPeriod: ReturnType<typeof _createPeriodsHandler>;
  listPeriods: ReturnType<typeof _createPeriodsListHandler>;
  getPeriod: ReturnType<typeof _createPeriodGetHandler>;
  updatePeriod: ReturnType<typeof _createPeriodPutHandler>;
  addDay: ReturnType<typeof _createPeriodDayAddHandler>;
  overwriteDay: ReturnType<typeof _createPeriodDayOverwriteHandler>;
  getHistory: ReturnType<typeof _createPeriodDayHistoryHandler>;
  mutateHistory: ReturnType<typeof _createPeriodDayHistoryMutationHandler>;
} {
  const services = createInMemoryApiServices({
    now: () => now,
    createHistoryId,
  });

  function withCurrentSaveKey(handler: RequestHandler): RequestHandler {
    return async (event) => {
      const headers = new Headers(event.request.headers);
      if (!headers.has("idempotency-key")) {
        const epoch = await runApiEffect(services.getDayEntryEpoch());
        headers.set("idempotency-key", `${epoch}.${crypto.randomUUID()}`);
      }
      return handler({
        ...event,
        request: new Request(event.request, { headers }),
      });
    };
  }
  return {
    services,
    createPeriod: _createPeriodsHandler({ services, tracing }),
    listPeriods: _createPeriodsListHandler({ services }),
    getPeriod: _createPeriodGetHandler({ services, tracing }),
    updatePeriod: _createPeriodPutHandler({ services, tracing }),
    addDay: withCurrentSaveKey(
      _createPeriodDayAddHandler({ services, tracing }),
    ),
    overwriteDay: withCurrentSaveKey(
      _createPeriodDayOverwriteHandler({ services, tracing }),
    ),
    getHistory: _createPeriodDayHistoryHandler({ services }),
    mutateHistory: _createPeriodDayHistoryMutationHandler({
      services,
      tracing,
    }),
  };
}
