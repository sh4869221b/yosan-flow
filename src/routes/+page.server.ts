import type { PageServerLoad } from "./$types";
import { buildMonthSummary, getApiServicesFromPlatform } from "$lib/server/services/month-summary-service";
import { getJstDateParts } from "$lib/server/time/jst";
import { parseYearMonth } from "$lib/server/validation/month";

function resolveYearMonth(url: URL): string {
  const fallback = getJstDateParts(new Date()).yearMonth;
  const requested = url.searchParams.get("yearMonth") ?? url.searchParams.get("month");
  if (!requested) {
    return fallback;
  }

  try {
    return parseYearMonth(requested);
  } catch {
    return fallback;
  }
}

export const load: PageServerLoad = async ({ platform, url }) => {
  const yearMonth = resolveYearMonth(url);
  const services = getApiServicesFromPlatform(platform);
  const summary = await buildMonthSummary(services.monthRepository, yearMonth, {
    jstToday: services.jstToday(),
    dailyTotals: await services.listDailyTotalsByYearMonth(yearMonth)
  });

  return {
    summary
  };
};
