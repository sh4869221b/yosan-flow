import { json } from "@sveltejs/kit";

export type ErrorResponseBody = {
  error: {
    code: string;
    message: string;
  };
};

export class ApiRouteError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiRouteError";
    this.status = status;
    this.code = code;
  }
}

export function parseYearMonth(value: string | undefined): string {
  if (!value) {
    throw new ApiRouteError(400, "INVALID_YEAR_MONTH", "yearMonth は yyyy-mm 形式で指定してください。");
  }

  const matched = /^(\d{4})-(\d{2})$/.exec(value);
  if (!matched) {
    throw new ApiRouteError(400, "INVALID_YEAR_MONTH", "yearMonth は yyyy-mm 形式で指定してください。");
  }

  const month = Number(matched[2]);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new ApiRouteError(400, "INVALID_YEAR_MONTH", "yearMonth は yyyy-mm 形式で指定してください。");
  }

  return value;
}

export function parsePeriodId(value: string | undefined): string {
  if (!value || typeof value !== "string" || value.trim().length === 0) {
    throw new ApiRouteError(400, "INVALID_PERIOD_ID", "periodId を指定してください。");
  }
  return value;
}

export function parseNonNegativeIntegerYen(value: unknown, fieldName: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new ApiRouteError(400, "INVALID_AMOUNT", `${fieldName} は 0 以上の整数で指定してください。`);
  }

  return value as number;
}

export async function parseRequestBodyObject(request: Request): Promise<Record<string, unknown>> {
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new ApiRouteError(400, "INVALID_BODY", "リクエスト JSON が不正です。");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ApiRouteError) {
      throw error;
    }
    throw new ApiRouteError(400, "INVALID_BODY", "リクエスト JSON が不正です。");
  }
}

export function parseOptionalBudgetYen(body: Record<string, unknown>): number | undefined {
  if (body.budgetYen == null) {
    return undefined;
  }

  return parseNonNegativeIntegerYen(body.budgetYen, "budgetYen");
}

export function parseBudgetYen(body: Record<string, unknown>): number {
  if (body.budgetYen == null) {
    throw new ApiRouteError(400, "INVALID_AMOUNT", "budgetYen は 0 以上の整数で指定してください。");
  }

  return parseNonNegativeIntegerYen(body.budgetYen, "budgetYen");
}

function toErrorResponse(status: number, code: string, message: string): Response {
  const body: ErrorResponseBody = {
    error: {
      code,
      message
    }
  };
  return json(body, { status });
}

export function toApiErrorResponse(error: unknown): Response {
  if (error instanceof ApiRouteError) {
    return toErrorResponse(error.status, error.code, error.message);
  }

  const code = typeof error === "object" && error != null && "code" in error
    ? (error as { code?: unknown }).code
    : undefined;
  const message = error instanceof Error ? error.message : "";
  const resolvedCode =
    typeof code === "string" && code.length > 0
      ? code
      : [
          "PERIOD_NOT_FOUND",
          "DATE_OUT_OF_PERIOD",
          "PERIOD_OVERLAP",
          "PERIOD_CONTINUITY_VIOLATION",
          "PERIOD_PREDECESSOR_NOT_FOUND",
          "INVALID_PERIOD_RANGE",
          "PERIOD_HAS_OUT_OF_RANGE_ENTRIES"
        ].find((candidate) => message.includes(candidate));

  if (resolvedCode === "PERIOD_NOT_FOUND") {
    return toErrorResponse(404, "PERIOD_NOT_FOUND", "対象の予算期間が見つかりません。");
  }
  if (resolvedCode === "DATE_OUT_OF_PERIOD") {
    return toErrorResponse(400, "DATE_OUT_OF_PERIOD", "指定された date は予算期間の範囲外です。");
  }
  if (resolvedCode === "PERIOD_OVERLAP") {
    return toErrorResponse(400, "PERIOD_OVERLAP", "予算期間が既存期間と重複しています。");
  }
  if (resolvedCode === "PERIOD_CONTINUITY_VIOLATION") {
    return toErrorResponse(400, "PERIOD_CONTINUITY_VIOLATION", "前後の予算期間との連続性が不正です。");
  }
  if (resolvedCode === "PERIOD_PREDECESSOR_NOT_FOUND") {
    return toErrorResponse(400, "PERIOD_PREDECESSOR_NOT_FOUND", "前期間が見つかりません。");
  }
  if (resolvedCode === "INVALID_PERIOD_RANGE") {
    return toErrorResponse(400, "INVALID_PERIOD_RANGE", "開始日と終了日の範囲が不正です。");
  }
  if (resolvedCode === "PERIOD_HAS_OUT_OF_RANGE_ENTRIES") {
    return toErrorResponse(
      400,
      "PERIOD_HAS_OUT_OF_RANGE_ENTRIES",
      "期間外に出る日次データが存在するため、この変更は適用できません。"
    );
  }

  return toErrorResponse(500, "INTERNAL_ERROR", "サーバーエラーが発生しました。");
}
