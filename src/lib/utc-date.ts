export const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export function toDateValue(date: string): number {
  return Date.parse(`${date}T00:00:00.000Z`);
}

export function fromDateValue(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return fromDateValue(toDateValue(date) + days * MILLISECONDS_PER_DAY);
}
