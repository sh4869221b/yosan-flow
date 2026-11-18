import {
  fromDateValue,
  MILLISECONDS_PER_DAY,
  toDateValue,
} from "#lib/utc-date.ts";

const dayOfMonthLabels = Array.from({ length: 31 }, (_, index) =>
  String(index + 1).padStart(2, "0"),
);

type DateRange = {
  startTime: number;
  length: number;
};

export function getDateRange(startDate: string, endDate: string): DateRange {
  const startTime = toDateValue(startDate);
  const endTime = toDateValue(endDate);
  const length =
    startDate <= endDate && startTime <= endTime
      ? (endTime - startTime) / MILLISECONDS_PER_DAY + 1
      : 0;
  return { startTime, length };
}

export function getDateIndex(range: DateRange, date: string): number {
  const time = toDateValue(date);
  const index = (time - range.startTime) / MILLISECONDS_PER_DAY;
  // Date.parse normalizes dates such as February 30 that never appear in a range.
  return index >= 0 && index < range.length && fromDateValue(time) === date
    ? index
    : -1;
}

export function mapDateRange<T>(
  range: DateRange,
  mapDay: (date: string, index: number) => T,
): T[] {
  if (range.length === 1) return [mapDay(fromDateValue(range.startTime), 0)];

  const rows = new Array<T>(range.length);
  const cursor = new Date(range.startTime);
  let time = range.startTime;
  let index = 0;
  while (index < range.length) {
    const firstDay = cursor.getUTCDate();
    const iso = cursor.toISOString();
    const monthPrefix = iso.slice(0, iso.indexOf("T") - 2);
    const nextMonthTime = cursor.setUTCMonth(cursor.getUTCMonth() + 1, 1);
    const daysToNextMonth = (nextMonthTime - time) / MILLISECONDS_PER_DAY;
    // The month after the maximum representable Date is outside Date's range.
    const stop = Number.isNaN(daysToNextMonth)
      ? range.length
      : Math.min(index + daysToNextMonth, range.length);
    for (let day = firstDay; index < stop; day += 1, index += 1) {
      const date = (monthPrefix + dayOfMonthLabels[day - 1]).slice(0, 10);
      rows[index] = mapDay(date, index);
    }
    time = nextMonthTime;
  }
  return rows;
}
