function assertValidDate(value: string): void {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!matched) {
    throw new Error(`Invalid date: ${value}`);
  }

  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  const utcDate = new Date(Date.UTC(year, month - 1, day));

  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() + 1 !== month ||
    utcDate.getUTCDate() !== day
  ) {
    throw new Error(`Invalid date: ${value}`);
  }
}

function toDateValue(date: string): number {
  assertValidDate(date);
  return Date.parse(`${date}T00:00:00.000Z`);
}

function toDateString(dateValue: number): string {
  return new Date(dateValue).toISOString().slice(0, 10);
}

export function getNextPeriodStartDate(previousEndDate: string): string {
  const previousEndDateValue = toDateValue(previousEndDate);
  return toDateString(previousEndDateValue + 24 * 60 * 60 * 1000);
}

export function isDateWithinPeriod(date: string, startDate: string, endDate: string): boolean {
  const dateValue = toDateValue(date);
  const startDateValue = toDateValue(startDate);
  const endDateValue = toDateValue(endDate);

  if (startDateValue > endDateValue) {
    throw new Error(`Invalid period: ${startDate}..${endDate}`);
  }

  return startDateValue <= dateValue && dateValue <= endDateValue;
}
