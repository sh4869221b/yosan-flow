import {
  ApiRouteError,
  parseNonNegativeIntegerYen,
  parseRequestBodyObject
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

export type DayMutationInput = {
  inputYen: number;
  memo: string | null;
};

export async function parseDayMutationInput(request: Request): Promise<DayMutationInput> {
  const body = await parseRequestBodyObject(request);
  const inputYen = parseNonNegativeIntegerYen(body.inputYen, "inputYen");

  const memoValue = body.memo;
  if (memoValue != null && typeof memoValue !== "string") {
    throw new ApiRouteError(400, "INVALID_MEMO", "memo は文字列で指定してください。");
  }

  return {
    inputYen,
    memo: memoValue == null ? null : memoValue.trim() || null
  };
}
