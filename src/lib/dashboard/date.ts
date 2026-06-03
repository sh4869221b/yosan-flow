export function addDays(date: string, days: number): string {
  const current = Date.parse(`${date}T00:00:00.000Z`);
  return new Date(current + days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export function toPeriodId(startDate: string): string {
  return `p-${startDate}`;
}
