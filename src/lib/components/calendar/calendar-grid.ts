/**
 * Pure calendar grid generation for period calendar.
 *
 * All functions are side-effect-free and unit-testable.
 * The Svelte component imports from here instead of computing inline.
 */

export type DailyRow = {
  date: string;
  label: "today" | "planned";
  usedYen: number;
  recommendedYen: number;
};

export type CalendarMonth = {
  key: string;
  label: string;
  weeks: Array<Array<string | null>>;
};

/**
 * Convert a YYYY-MM-DD string to a UTC epoch number.
 * Uses the T00:00:00.000Z suffix so the date is interpreted
 * in UTC regardless of the host timezone.
 */
export function toDateValue(date: string): number {
  return Date.parse(`${date}T00:00:00.000Z`);
}

/**
 * Convert a UTC epoch number back to a YYYY-MM-DD string.
 */
export function fromDateValue(value: number): string {
  return new Date(value).toISOString().slice(0, 10);
}

/**
 * Add one day (86 400 000 ms) to a YYYY-MM-DD string.
 */
export function addDay(date: string): string {
  return fromDateValue(toDateValue(date) + 24 * 60 * 60 * 1000);
}

/**
 * Build a human-readable month label like "2026年5月".
 * The locale defaults to "ja-JP" but can be overridden for tests.
 */
export function buildMonthLabel(
  date: string,
  locale: string = "ja-JP",
): string {
  const formatter = new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
  });
  return formatter.format(new Date(`${date}T00:00:00.000Z`));
}

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
  locale: string = "ja-JP",
): CalendarMonth[] {
  if (!periodStartDate || !periodEndDate || periodStartDate > periodEndDate) {
    return [];
  }

  const monthMap = new Map<string, string[]>();
  let cursor = periodStartDate;
  while (cursor <= periodEndDate) {
    const key = cursor.slice(0, 7);
    const dates = monthMap.get(key);
    if (dates) {
      dates.push(cursor);
    } else {
      monthMap.set(key, [cursor]);
    }
    cursor = addDay(cursor);
  }

  return [...monthMap.entries()].map(([key, dates]) => {
    const firstWeekday = new Date(`${dates[0]}T00:00:00.000Z`).getUTCDay();
    const cells: Array<string | null> = Array.from(
      { length: firstWeekday },
      () => null,
    );
    for (const date of dates) {
      cells.push(date);
    }
    while (cells.length % 7 !== 0) {
      cells.push(null);
    }

    const weeks: Array<Array<string | null>> = [];
    for (let index = 0; index < cells.length; index += 7) {
      weeks.push(cells.slice(index, index + 7));
    }

    return {
      key,
      label: buildMonthLabel(`${key}-01`, locale),
      weeks,
    };
  });
}
