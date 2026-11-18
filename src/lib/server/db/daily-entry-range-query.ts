import { and, eq, gt, lt, or, type SQLWrapper } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";

export function dailyEntryOutsideRange(
  table: { budget_period_id: SQLiteColumn; date: SQLiteColumn },
  periodId: string | SQLWrapper,
  startDate: string | SQLWrapper,
  endDate: string | SQLWrapper,
) {
  const inPeriod = eq(table.budget_period_id, periodId);
  // Each OR branch can seek directly into the (budget_period_id, date) index.
  return or(
    and(inPeriod, lt(table.date, startDate)),
    and(inPeriod, gt(table.date, endDate)),
  );
}
