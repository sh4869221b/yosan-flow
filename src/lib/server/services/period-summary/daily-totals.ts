import { isDateWithinPeriod } from "#lib/server/domain/budget-period.ts";
import type { PeriodSummaryDailyTotal } from "./period-summary-calculator";

export function buildDailyTotalMap(
  periodId: string,
  startDate: string,
  endDate: string,
  dailyTotals: PeriodSummaryDailyTotal[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of dailyTotals) {
    if (row.budgetPeriodId !== periodId) {
      continue;
    }
    if (!isDateWithinPeriod(row.date, startDate, endDate)) {
      continue;
    }
    map.set(row.date, (map.get(row.date) ?? 0) + row.totalUsedYen);
  }
  return map;
}
