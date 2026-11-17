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
  const rows = new Array<T>(range.length);
  const cursor = new Date(range.startTime);
  let time = range.startTime;
  let monthPrefix = "";
  for (let index = 0; index < range.length; index += 1) {
    cursor.setTime(time);
    const dayOfMonth = cursor.getUTCDate();
    if (index === 0 || dayOfMonth === 1) {
      // Format the month once and reuse its prefix for every day in it.
      const iso = cursor.toISOString();
      monthPrefix = iso.slice(0, iso.indexOf("T") - 2);
    }
    const date = (monthPrefix + dayOfMonthLabels[dayOfMonth - 1]).slice(0, 10);
    rows[index] = mapDay(date, index);
    time += MILLISECONDS_PER_DAY;
  }
  return rows;
}
