/**
 * Pure calendar grid generation for period calendar.
 *
 * All functions are side-effect-free and unit-testable.
 * The Svelte component imports from here instead of computing inline.
 */

import {
  fromDateValue,
  MILLISECONDS_PER_DAY,
  toDateValue,
} from "#lib/utc-date.ts";

export type DailyRow = {
  date: string;
  label: "today" | "planned";
  usedYen: number;
  isRecorded: boolean;
  recommendedYen: number;
};

export type CalendarMonth = {
  key: string;
  label: string;
  weeks: Array<Array<string | null>>;
};

/**
 * Build a human-readable month label like "2026年5月".
 */
const monthFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "long",
});

/**
 * Build calendar months covering the period from `periodStartDate`
 * to `periodEndDate` (inclusive).
 *
 * Each month contains a `weeks` array where each week is 7 cells.
 * Cells are either a YYYY-MM-DD date string or `null` for padding.
 *
 * Returns an empty array when the range is invalid or empty.
 */
export function buildMonths(
  periodStartDate: string,
  periodEndDate: string,
): CalendarMonth[] {
  if (
    periodStartDate.length !== 10 ||
    periodEndDate.length !== 10 ||
    periodStartDate > periodEndDate
  ) {
    return [];
  }

  const months: CalendarMonth[] = [];
  let cursor = toDateValue(periodStartDate);
  const endTime = toDateValue(periodEndDate);
  while (cursor <= endTime) {
    const monthDate = new Date(cursor);
    const key = monthDate.toISOString().slice(0, 7);
    const label = monthFormatter.format(monthDate);
    let weekday = monthDate.getUTCDay();
    const nextMonth = monthDate.setUTCMonth(monthDate.getUTCMonth() + 1, 1);
    const monthEnd = Math.min(endTime, nextMonth - MILLISECONDS_PER_DAY);
    const weeks: CalendarMonth["weeks"] = [];
    while (cursor <= monthEnd) {
      const week = Array<string | null>(7).fill(null);
      for (; weekday < week.length && cursor <= monthEnd; weekday++) {
        week[weekday] = fromDateValue(cursor);
        cursor += MILLISECONDS_PER_DAY;
      }
      weeks.push(week);
      weekday = 0;
    }
    months.push({ key, label, weeks });
  }
  return months;
}
