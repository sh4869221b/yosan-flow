import { isDateWithinPeriod } from "$lib/server/domain/budget-period";
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

export function sumDailyTotals(dailyTotalsByDate: Map<string, number>): number {
  return [...dailyTotalsByDate.values()].reduce(
    (total, current) => total + current,
    0,
  );
}

export function sumDailyTotalsThroughDate(
  dailyTotalsByDate: Map<string, number>,
  endDate: string,
): number {
  return [...dailyTotalsByDate.entries()].reduce((total, [date, value]) => {
    return date <= endDate ? total + value : total;
  }, 0);
}

export function sumDailyTotalsBeforeDate(
  dailyTotalsByDate: Map<string, number>,
  dateBefore: string,
): number {
  return [...dailyTotalsByDate.entries()].reduce((total, [date, value]) => {
    return date < dateBefore ? total + value : total;
  }, 0);
}
