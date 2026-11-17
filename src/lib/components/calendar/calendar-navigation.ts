import {
  fromDateValue,
  MILLISECONDS_PER_DAY,
  toDateValue,
} from "#lib/utc-date.ts";

export type CalendarDateRange = {
  readonly startDate: string;
  readonly endDate: string;
};

export function getInitialFocusDate(
  selectedDate: string | null,
  today: string,
  range: CalendarDateRange,
): string | null {
  const startValue = toDateValue(range.startDate);
  const endValue = toDateValue(range.endDate);
  if (!(startValue <= endValue)) {
    return null;
  }

  if (selectedDate !== null) {
    const selectedValue = toDateValue(selectedDate);
    if (selectedValue >= startValue && selectedValue <= endValue)
      return selectedDate;
  }
  const todayValue = toDateValue(today);
  return todayValue >= startValue && todayValue <= endValue
    ? today
    : range.startDate;
}

export function getCalendarNavigationTarget(
  currentDate: string,
  key: string,
  range: CalendarDateRange,
): string | null {
  const startValue = toDateValue(range.startDate);
  const endValue = toDateValue(range.endDate);
  if (!(startValue <= endValue)) {
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
  return fromDateValue(Math.min(Math.max(targetValue, startValue), endValue));
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
  const targetDay = date.getUTCDate();
  // Day zero of the following month is the last day of the target month.
  date.setUTCMonth(date.getUTCMonth() + monthOffset + 1, 0);
  return date.setUTCDate(Math.min(targetDay, date.getUTCDate()));
}
