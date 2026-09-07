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

export type PeriodRangeValidation = {
  readonly startError: string | null;
  readonly endError: string | null;
  readonly rangeError: string | null;
  readonly isValid: boolean;
};

function toDateValue(value: string): DateValue | undefined {
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

export function getPeriodRangeCalendarValue(input: {
  readonly startDate: string;
  readonly endDate: string;
}): PeriodRange {
  const range = createPeriodRange(input);
  const startDate = range.start?.toString() ?? "";
  const endDate = range.end?.toString() ?? "";

  if (!startDate || (endDate && startDate > endDate)) {
    return { start: undefined, end: undefined };
  }

  return range;
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

export function getPeriodRangeValidation(input: {
  readonly startDate: string;
  readonly endDate: string;
}): PeriodRangeValidation {
  const selection = getPeriodRangeSelection(createPeriodRange(input));
  const rangeError =
    selection.startDate && selection.endDate && !selection.isValid
      ? "終了日は開始日以降にしてください。"
      : null;

  return {
    startError: selection.startDate ? null : "有効な開始日を入力してください。",
    endError: selection.endDate ? null : "有効な終了日を入力してください。",
    rangeError,
    isValid: selection.isValid,
  };
}
