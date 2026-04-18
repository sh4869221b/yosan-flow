import {
  ApiRouteError,
  parseNonNegativeIntegerYen,
  parseRequestBodyObject,
  parseYearMonth
} from "./month";

export function parseDate(date: string | undefined): string {
  if (!date) {
    throw new ApiRouteError(400, "INVALID_DATE", "date は yyyy-mm-dd 形式で指定してください。");
  }

  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!matched) {
    throw new ApiRouteError(400, "INVALID_DATE", "date は yyyy-mm-dd 形式で指定してください。");
  }

  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);

  const normalized = new Date(Date.UTC(year, month - 1, day));
  if (
    normalized.getUTCFullYear() !== year ||
    normalized.getUTCMonth() + 1 !== month ||
    normalized.getUTCDate() !== day
  ) {
    throw new ApiRouteError(400, "INVALID_DATE", "date は yyyy-mm-dd 形式で指定してください。");
  }

  return date;
}

export function yearMonthOfDate(date: string): string {
  return parseDate(date).slice(0, 7);
}

export function assertDateInYearMonth(date: string, yearMonth: string): void {
  if (yearMonthOfDate(date) !== yearMonth) {
    throw new ApiRouteError(
      400,
      "DATE_OUT_OF_MONTH",
      "指定された date が対象 month の範囲外です。"
    );
  }
}

export type DayMutationInput = {
  inputYen: number;
  memo: string | null;
  yearMonth?: string;
};

export async function parseDayMutationInput(request: Request): Promise<DayMutationInput> {
  const body = await parseRequestBodyObject(request);
  const inputYen = parseNonNegativeIntegerYen(body.inputYen, "inputYen");

  if (body.yearMonth != null) {
    if (typeof body.yearMonth !== "string") {
      throw new ApiRouteError(400, "INVALID_YEAR_MONTH", "yearMonth は yyyy-mm 形式で指定してください。");
    }
    parseYearMonth(body.yearMonth);
  }

  const memoValue = body.memo;
  if (memoValue != null && typeof memoValue !== "string") {
    throw new ApiRouteError(400, "INVALID_MEMO", "memo は文字列で指定してください。");
  }

  return {
    inputYen,
    memo: memoValue == null ? null : memoValue.trim() || null,
    yearMonth: body.yearMonth as string | undefined
  };
}
