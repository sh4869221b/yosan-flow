import { isDateWithinPeriod } from "#lib/server/domain/budget-period.ts";
import type { BudgetPeriodRecord } from "#lib/server/db/budget-period-repository.ts";
import type { PeriodSummaryDailyTotal } from "./period-summary-calculator";

export function summarizeDailyTotals(
  { id, startDate, endDate }: BudgetPeriodRecord,
  dailyTotals: PeriodSummaryDailyTotal[],
  jstToday: string,
) {
  const totalsByDate = new Map<string, number>();
  for (const row of dailyTotals) {
    if (row.budgetPeriodId !== id) {
      continue;
    }
    if (!isDateWithinPeriod(row.date, startDate, endDate)) {
      continue;
    }
    totalsByDate.set(
      row.date,
      (totalsByDate.get(row.date) ?? 0) + row.totalUsedYen,
    );
  }

  let plannedTotalYen = 0;
  let spentToDateYen = 0;
  let spentBeforeTodayYen = 0;
  let usedTodayYen = 0;
  // Sum grouped dates in first-seen order so large totals round consistently.
  for (const [date, totalUsedYen] of totalsByDate) {
    plannedTotalYen += totalUsedYen;
    if (date < jstToday) {
      spentBeforeTodayYen += totalUsedYen;
      spentToDateYen += totalUsedYen;
    } else if (date === jstToday) {
      usedTodayYen = totalUsedYen;
      spentToDateYen += totalUsedYen;
    }
  }
  return {
    totalsByDate,
    plannedTotalYen,
    spentToDateYen,
    spentBeforeTodayYen,
    usedTodayYen,
  };
}
