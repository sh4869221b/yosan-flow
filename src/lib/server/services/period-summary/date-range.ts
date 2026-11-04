export function buildDateRange(startDate: string, endDate: string): string[] {
  if (startDate > endDate) {
    return [];
  }

  const rows: string[] = [];
  const endTime = Date.parse(`${endDate}T00:00:00.000Z`);
  for (
    let cursor = Date.parse(`${startDate}T00:00:00.000Z`);
    cursor <= endTime;
    cursor += 24 * 60 * 60 * 1000
  ) {
    rows.push(new Date(cursor).toISOString().slice(0, 10));
  }
  return rows;
}
