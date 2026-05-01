import { json } from "@sveltejs/kit";
import {
  toApiErrorResponseResult,
  type ErrorResponseBody,
} from "$lib/server/effect/result";

export type { ErrorResponseBody };

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
    throw new ApiRouteError(
      400,
      "INVALID_YEAR_MONTH",
      "yearMonth は yyyy-mm 形式で指定してください。",
    );
  }

  const matched = /^(\d{4})-(\d{2})$/.exec(value);
  if (!matched) {
    throw new ApiRouteError(
      400,
      "INVALID_YEAR_MONTH",
      "yearMonth は yyyy-mm 形式で指定してください。",
    );
  }

  const month = Number(matched[2]);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new ApiRouteError(
      400,
      "INVALID_YEAR_MONTH",
      "yearMonth は yyyy-mm 形式で指定してください。",
    );
  }

  return value;
}

export function parsePeriodId(value: string | undefined): string {
  if (!value || typeof value !== "string" || value.trim().length === 0) {
    throw new ApiRouteError(
      400,
      "INVALID_PERIOD_ID",
      "periodId を指定してください。",
    );
  }
  return value;
}

export function parseNonNegativeIntegerYen(
  value: unknown,
  fieldName: string,
): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new ApiRouteError(
      400,
      "INVALID_AMOUNT",
      `${fieldName} は 0 以上の整数で指定してください。`,
    );
  }

  return value as number;
}

export async function parseRequestBodyObject(
  request: Request,
): Promise<Record<string, unknown>> {
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new ApiRouteError(
        400,
        "INVALID_BODY",
        "リクエスト JSON が不正です。",
      );
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ApiRouteError) {
      throw error;
    }
    throw new ApiRouteError(
      400,
      "INVALID_BODY",
      "リクエスト JSON が不正です。",
    );
  }
}

export function parseOptionalBudgetYen(
  body: Record<string, unknown>,
): number | undefined {
  if (body.budgetYen == null) {
    return undefined;
  }

  return parseNonNegativeIntegerYen(body.budgetYen, "budgetYen");
}

export function parseBudgetYen(body: Record<string, unknown>): number {
  if (body.budgetYen == null) {
    throw new ApiRouteError(
      400,
      "INVALID_AMOUNT",
      "budgetYen は 0 以上の整数で指定してください。",
    );
  }

  return parseNonNegativeIntegerYen(body.budgetYen, "budgetYen");
}

export function toApiErrorResponse(error: unknown): Response {
  const result = toApiErrorResponseResult(error);
  return json(result.body, { status: result.status });
}
