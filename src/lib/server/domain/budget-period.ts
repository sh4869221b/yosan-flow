import { addDays } from "#lib/utc-date.ts";

export function getNextPeriodStartDate(previousEndDate: string): string {
  return addDays(previousEndDate, 1);
}

export function getPreviousPeriodEndDate(nextStartDate: string): string {
  return addDays(nextStartDate, -1);
}

export function isDateWithinPeriod(
  date: string,
  startDate: string,
  endDate: string,
): boolean {
  // ISO calendar dates are validated at their input boundary and sort in
  // chronological order. The range itself was checked when it was formed.
  return startDate <= date && date <= endDate;
}
