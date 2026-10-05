import { assertValidDate } from "./daily-entry";

function toDateValue(date: string): number {
  assertValidDate(date);
  return Date.parse(`${date}T00:00:00.000Z`);
}

export function getNextPeriodStartDate(previousEndDate: string): string {
  const previousEndDateValue = toDateValue(previousEndDate);
  return new Date(previousEndDateValue + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export function isDateWithinPeriod(
  date: string,
  startDate: string,
  endDate: string,
): boolean {
  const dateValue = toDateValue(date);
  const startDateValue = toDateValue(startDate);
  const endDateValue = toDateValue(endDate);

  if (startDateValue > endDateValue) {
    throw new Error(`Invalid period: ${startDate}..${endDate}`);
  }

  return startDateValue <= dateValue && dateValue <= endDateValue;
}
