import type { PageServerLoad } from "./$types";
import { selectDashboardPeriodId } from "#lib/dashboard/select-dashboard-period.ts";
import { runApiEffect } from "#lib/server/effect/runtime.ts";
import { getRequestTracing } from "#lib/server/observability/tracing-workers.ts";
import {
  getApiServices,
  getPeriodSummaryFromServices,
} from "#lib/server/services/month-summary-service.ts";
import { parsePeriodId } from "#lib/server/validation/month.ts";

function resolveRequestedPeriodId(url: URL): string | null {
  const requested = url.searchParams.get("periodId");
  if (!requested) {
    return null;
  }
  try {
    return parsePeriodId(requested);
  } catch {
    return null;
  }
}

export const load = (async ({ url, setHeaders }) => {
  setHeaders({ "cache-control": "no-store" });
  const services = getApiServices();
  const tracing = getRequestTracing();
  const requestedPeriodId = resolveRequestedPeriodId(url);
  const [periods, epoch] = await Promise.all([
    runApiEffect(services.listPeriods()),
    runApiEffect(services.getDayEntryEpoch()),
  ]);
  const cutover: { dayEntryEpoch?: string } = { dayEntryEpoch: epoch };
  const today = services.jstToday();
  const selectedPeriodId = selectDashboardPeriodId(
    periods,
    requestedPeriodId,
    today,
  );
  if (selectedPeriodId === null) {
    return { ...cutover, today, periods, selectedPeriodId, summary: null };
  }
  const summary = await runApiEffect(
    getPeriodSummaryFromServices(services, selectedPeriodId, tracing),
  );
  return { ...cutover, today, periods, selectedPeriodId, summary };
}) satisfies PageServerLoad;
