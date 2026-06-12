import { parseDate, type DateValue } from "@internationalized/date";

export type PeriodRange = {
  start: DateValue | undefined;
  end: DateValue | undefined;
};

export type PeriodRangeField = "start" | "end";

export type PeriodRangeSelection = {
  readonly startDate: string;
  readonly endDate: string;
  readonly isValid: boolean;
};

export function toDateValue(value: string): DateValue | undefined {
  if (!value) {
    return undefined;
  }
  try {
    return parseDate(value);
  } catch {
    return undefined;
  }
}

export function createPeriodRange(input: {
  readonly startDate: string;
  readonly endDate: string;
}): PeriodRange {
  return {
    start: toDateValue(input.startDate),
    end: toDateValue(input.endDate),
  };
}

export function updatePeriodRangeInput(
  range: PeriodRange,
  field: PeriodRangeField,
  value: string,
): PeriodRange {
  return {
    ...range,
    [field]: toDateValue(value),
  };
}

export function getPeriodRangeSelection(
  range: PeriodRange,
): PeriodRangeSelection {
  const startDate = range.start?.toString() ?? "";
  const endDate = range.end?.toString() ?? "";

  return {
    startDate,
    endDate,
    isValid: Boolean(startDate && endDate && startDate <= endDate),
  };
}
