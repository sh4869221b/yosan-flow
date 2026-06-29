export function isFutureDateFromJstToday(
  targetDate: string,
  jstToday: string,
): boolean {
  return targetDate > jstToday;
}
