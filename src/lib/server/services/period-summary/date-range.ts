export function buildDateRange(startDate: string, endDate: string): string[] {
  if (startDate > endDate) {
    return [];
  }

  const rows: string[] = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    rows.push(cursor);
    cursor = new Date(
      Date.parse(`${cursor}T00:00:00.000Z`) + 24 * 60 * 60 * 1000,
    )
      .toISOString()
      .slice(0, 10);
  }
  return rows;
}
