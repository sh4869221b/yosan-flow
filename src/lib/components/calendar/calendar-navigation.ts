import { fromDateValue, toDateValue } from "./calendar-grid";

export type CalendarDateRange = {
  readonly startDate: string;
  readonly endDate: string;
};

export function getInitialFocusDate(
  selectedDate: string | null,
  today: string,
  range: CalendarDateRange,
): string | null {
  if (!isValidRange(range)) {
    return null;
  }

  const candidates: readonly (string | null)[] = [
    selectedDate,
    today,
    range.startDate,
  ];
  for (const candidate of candidates) {
    if (candidate !== null && isWithinRange(candidate, range)) {
      return candidate;
    }
  }
  return null;
}

export function getCalendarNavigationTarget(
  currentDate: string,
  key: string,
  range: CalendarDateRange,
): string | null {
  if (!isValidRange(range)) {
    return null;
  }

  const currentValue = toDateValue(currentDate);
  if (Number.isNaN(currentValue)) {
    return null;
  }

  const targetValue = getTargetValue(currentValue, key);
  if (targetValue === null) {
    return null;
  }
  return clampDate(fromDateValue(targetValue), range);
}

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function isValidRange(range: CalendarDateRange): boolean {
  const startValue = toDateValue(range.startDate);
  const endValue = toDateValue(range.endDate);
  return (
    !Number.isNaN(startValue) &&
    !Number.isNaN(endValue) &&
    startValue <= endValue
  );
}

function isWithinRange(date: string, range: CalendarDateRange): boolean {
  const dateValue = toDateValue(date);
  return (
    !Number.isNaN(dateValue) &&
    dateValue >= toDateValue(range.startDate) &&
    dateValue <= toDateValue(range.endDate)
  );
}

function clampDate(date: string, range: CalendarDateRange): string {
  const dateValue = toDateValue(date);
  const startValue = toDateValue(range.startDate);
  const endValue = toDateValue(range.endDate);
  return fromDateValue(Math.min(Math.max(dateValue, startValue), endValue));
}

function getTargetValue(currentValue: number, key: string): number | null {
  const currentDate = new Date(currentValue);
  switch (key) {
    case "ArrowLeft":
      return currentValue - MILLISECONDS_PER_DAY;
    case "ArrowRight":
      return currentValue + MILLISECONDS_PER_DAY;
    case "ArrowUp":
      return currentValue - 7 * MILLISECONDS_PER_DAY;
    case "ArrowDown":
      return currentValue + 7 * MILLISECONDS_PER_DAY;
    case "Home":
      return currentValue - currentDate.getUTCDay() * MILLISECONDS_PER_DAY;
    case "End":
      return (
        currentValue + (6 - currentDate.getUTCDay()) * MILLISECONDS_PER_DAY
      );
    case "PageUp":
      return shiftMonth(currentDate, -1);
    case "PageDown":
      return shiftMonth(currentDate, 1);
    default:
      return null;
  }
}

function shiftMonth(date: Date, monthOffset: number): number {
  const targetMonth = date.getUTCMonth() + monthOffset;
  const targetYear = date.getUTCFullYear();
  const targetDay = date.getUTCDate();
  const lastDay = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0),
  ).getUTCDate();
  return Date.UTC(targetYear, targetMonth, Math.min(targetDay, lastDay));
}
