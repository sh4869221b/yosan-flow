function toDateValue(date: string): number {
  return Date.parse(`${date}T00:00:00.000Z`);
}

function nextDate(date: string): string {
  return new Date(toDateValue(date) + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export function buildDateRange(startDate: string, endDate: string): string[] {
  if (startDate > endDate) {
    return [];
  }

  const rows: string[] = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    rows.push(cursor);
    cursor = nextDate(cursor);
  }
  return rows;
}

export function resolveDaysRemaining(
  startDate: string,
  endDate: string,
  jstToday: string,
): number {
  if (jstToday < startDate) {
    return buildDateRange(startDate, endDate).length;
  }
  if (jstToday > endDate) {
    return 0;
  }
  return buildDateRange(jstToday, endDate).length;
}
