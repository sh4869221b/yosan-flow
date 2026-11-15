// Calendar dates and ranges here are validated at their respective input boundaries.
function toDateValue(date: string): number {
  return Date.parse(`${date}T00:00:00.000Z`);
}

export function getNextPeriodStartDate(previousEndDate: string): string {
  const previousEndDateValue = toDateValue(previousEndDate);
  return new Date(previousEndDateValue + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export function getPreviousPeriodEndDate(nextStartDate: string): string {
  const nextStartDateValue = toDateValue(nextStartDate);
  return new Date(nextStartDateValue - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
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
