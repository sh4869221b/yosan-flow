import { parseDate, type DateValue } from "@internationalized/date";

export type PeriodRange = {
  start: DateValue | undefined;
  end: DateValue | undefined;
};

export type PeriodRangeField = "start" | "end";
export type PeriodRangeDraft = Readonly<{
  startDate: string;
  endDate: string;
}>;

export type PeriodRangeValidation = {
  readonly startError: string | null;
  readonly endError: string | null;
  readonly rangeError: string | null;
  readonly isValid: boolean;
};

export type PeriodRangeInput = Readonly<{
  draft: PeriodRangeDraft;
  parsed: PeriodRange;
  calendarValue: PeriodRange;
  validation: PeriodRangeValidation;
}>;

function toDateValue(value: string): DateValue | undefined {
  if (!value) return undefined;
  try {
    return parseDate(value);
  } catch {
    return undefined;
  }
}

function getRangeError(parsed: PeriodRange): string | null {
  if (parsed.start == null || parsed.end == null) return null;
  return parsed.start.compare(parsed.end) > 0
    ? "終了日は開始日以降にしてください。"
    : null;
}

function validateParsedRange(parsed: PeriodRange): PeriodRangeValidation {
  const startError = parsed.start ? null : "有効な開始日を入力してください。";
  const endError = parsed.end ? null : "有効な終了日を入力してください。";
  const rangeError = getRangeError(parsed);
  return {
    startError,
    endError,
    rangeError,
    isValid: !startError && !endError && !rangeError,
  };
}

function fromParsedRange(
  draft: PeriodRangeDraft,
  parsed: PeriodRange,
): PeriodRangeInput {
  const validation = validateParsedRange(parsed);
  return {
    draft: { ...draft },
    parsed,
    calendarValue:
      validation.startError || validation.rangeError
        ? { start: undefined, end: undefined }
        : parsed,
    validation,
  };
}

// Raw edits cross the input boundary once; unchanged endpoints keep their result.
export function parsePeriodRangeInput(
  draft: PeriodRangeDraft,
  previous?: PeriodRangeInput,
  calendarRange?: PeriodRange,
): PeriodRangeInput {
  if (
    previous?.draft.startDate === draft.startDate &&
    previous.draft.endDate === draft.endDate
  )
    return previous;
  if (calendarRange) return fromParsedRange(draft, calendarRange);
  return fromParsedRange(draft, {
    start:
      previous?.draft.startDate === draft.startDate
        ? previous.parsed.start
        : toDateValue(draft.startDate),
    end:
      previous?.draft.endDate === draft.endDate
        ? previous.parsed.end
        : toDateValue(draft.endDate),
  });
}
