import { Data } from "effect";

export type ApiErrorKind =
  | "validation"
  | "not_found"
  | "conflict"
  | "database"
  | "internal";

export class ApiResponseError extends Data.TaggedError("ApiResponseError")<{
  readonly kind: ApiErrorKind;
  readonly status: number;
  readonly code: string;
  readonly message: string;
}> {}

export function createApiResponseError(input: {
  readonly kind: ApiErrorKind;
  readonly status: number;
  readonly code: string;
  readonly message: string;
}): ApiResponseError {
  return new ApiResponseError(input);
}

export function createInternalApiError(): ApiResponseError {
  return createApiResponseError({
    kind: "internal",
    status: 500,
    code: "INTERNAL_ERROR",
    message: "サーバーエラーが発生しました。",
  });
}
