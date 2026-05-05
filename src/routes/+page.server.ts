import type { PageServerLoad } from "./$types";
import {
  getApiServicesFromPlatform,
  getPeriodSummaryFromServices,
} from "$lib/server/services/month-summary-service";
import { parsePeriodId } from "$lib/server/validation/month";

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

export const load: PageServerLoad = async ({ platform, url }) => {
  const services = getApiServicesFromPlatform(platform);
  const requestedPeriodId = resolveRequestedPeriodId(url);
  const periods = await services.listPeriods();
  const today = services.jstToday();
  if (periods.length === 0) {
    return {
      today,
      periods,
      selectedPeriodId: null,
      summary: null,
    };
  }

  const requestedPeriod = requestedPeriodId
    ? (periods.find((period) => period.id === requestedPeriodId) ?? null)
    : null;
  const currentPeriod =
    periods.find(
      (period) =>
        period.status === "active" &&
        period.startDate <= today &&
        today <= period.endDate,
    ) ?? null;
  const latestPeriod = periods[periods.length - 1] ?? null;
  const selectedPeriod = requestedPeriod ?? currentPeriod ?? latestPeriod;
  const summary = selectedPeriod
    ? await getPeriodSummaryFromServices(services, selectedPeriod.id)
    : null;

  return {
    today,
    periods,
    selectedPeriodId: selectedPeriod?.id ?? null,
    summary,
  };
};
