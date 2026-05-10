import { json } from "@sveltejs/kit";
import { Effect } from "effect";
import { toApiErrorResponseResult } from "$lib/server/effect/result";

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

export function parseRequestBodyObject(
  request: Request,
): Effect.Effect<Record<string, unknown>, Error> {
  return Effect.gen(function* () {
    const parsed = yield* Effect.tryPromise({
      try: () => request.json(),
      catch: () =>
        new ApiRouteError(400, "INVALID_BODY", "リクエスト JSON が不正です。"),
    });
    return yield* Effect.try({
      try: () => {
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new ApiRouteError(
            400,
            "INVALID_BODY",
            "リクエスト JSON が不正です。",
          );
        }
        return parsed as Record<string, unknown>;
      },
      catch: (error) =>
        error instanceof ApiRouteError
          ? error
          : new ApiRouteError(
              400,
              "INVALID_BODY",
              "リクエスト JSON が不正です。",
            ),
    });
  });
}

export function toApiErrorResponse(error: unknown): Response {
  const result = toApiErrorResponseResult(error);
  return json(result.body, { status: result.status });
}
