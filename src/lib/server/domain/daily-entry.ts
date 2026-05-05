export type DayEntryOperationType = "add" | "overwrite";

export type DayEntryCommand = {
  date: string;
  inputYen: number;
  memo?: string | null;
};

export function assertValidDate(date: string): void {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!matched) {
    throw new Error(`Invalid date: ${date}`);
  }

  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const normalizedYear = utcDate.getUTCFullYear();
  const normalizedMonth = utcDate.getUTCMonth() + 1;
  const normalizedDay = utcDate.getUTCDate();

  if (
    year !== normalizedYear ||
    month !== normalizedMonth ||
    day !== normalizedDay
  ) {
    throw new Error(`Invalid date: ${date}`);
  }
}

export function toYearMonth(date: string): string {
  assertValidDate(date);
  return date.slice(0, 7);
}

export function assertValidInputYen(inputYen: number): void {
  if (!Number.isInteger(inputYen) || inputYen < 0) {
    throw new Error(`Invalid inputYen: ${inputYen}`);
  }
}

export function normalizeMemo(memo?: string | null): string | null {
  if (memo == null) {
    return null;
  }
  const normalized = memo.trim();
  return normalized.length > 0 ? normalized : null;
}
