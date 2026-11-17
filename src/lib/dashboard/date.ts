import { fromDateValue } from "#lib/utc-date.ts";

export function getJstToday(now: Date = new Date()): string {
  return fromDateValue(now.getTime() + 9 * 60 * 60 * 1000);
}
