import { Effect } from "effect";
import {
  createApiResponseError,
  createInternalApiError,
  type ApiErrorKind,
  type ApiResponseError,
} from "$lib/server/effect/errors";

export type ErrorResponseBody = {
  error: {
    code: string;
    message: string;
  };
};

export type ApiErrorResponseResult = {
  status: number;
  body: ErrorResponseBody;
};

const KNOWN_ERROR_RESPONSES: Record<
  string,
  {
    readonly kind: ApiErrorKind;
    readonly status: number;
    readonly message: string;
  }
> = {
  PERIOD_NOT_FOUND: {
    kind: "not_found",
    status: 404,
    message: "対象の予算期間が見つかりません。",
  },
  DATE_OUT_OF_PERIOD: {
    kind: "validation",
    status: 400,
    message: "指定された date は予算期間の範囲外です。",
  },
  PERIOD_OVERLAP: {
    kind: "conflict",
    status: 400,
    message: "予算期間が既存期間と重複しています。",
  },
  PERIOD_CONTINUITY_VIOLATION: {
    kind: "validation",
    status: 400,
    message: "前後の予算期間との連続性が不正です。",
  },
  PERIOD_PREDECESSOR_NOT_FOUND: {
    kind: "validation",
    status: 400,
    message: "前期間が見つかりません。",
  },
  INVALID_PERIOD_RANGE: {
    kind: "validation",
    status: 400,
    message: "開始日と終了日の範囲が不正です。",
  },
  PERIOD_HAS_OUT_OF_RANGE_ENTRIES: {
    kind: "validation",
    status: 400,
    message: "期間外に出る日次データが存在するため、この変更は適用できません。",
  },
};

const KNOWN_ERROR_CODES = Object.keys(KNOWN_ERROR_RESPONSES);

// Boundary: Effect is limited to API failure shaping. Repository and domain
// layers continue to throw their existing errors so public behavior stays stable.
function readStringProperty(value: unknown, property: string): string | null {
  if (typeof value !== "object" || value == null || !(property in value)) {
    return null;
  }

  const propertyValue = (value as Record<string, unknown>)[property];
  return typeof propertyValue === "string" && propertyValue.length > 0
    ? propertyValue
    : null;
}

function readNumberProperty(value: unknown, property: string): number | null {
  if (typeof value !== "object" || value == null || !(property in value)) {
    return null;
  }

  const propertyValue = (value as Record<string, unknown>)[property];
  return typeof propertyValue === "number" && Number.isInteger(propertyValue)
    ? propertyValue
    : null;
}

function kindFromStatus(status: number): ApiErrorKind {
  if (status === 404) {
    return "not_found";
  }
  if (status === 409) {
    return "conflict";
  }
  if (status >= 500) {
    return "database";
  }
  return "validation";
}

function resolveKnownCode(error: unknown): string | null {
  const explicitCode = readStringProperty(error, "code");
  if (explicitCode && explicitCode in KNOWN_ERROR_RESPONSES) {
    return explicitCode;
  }

  const message = error instanceof Error ? error.message : "";
  return (
    KNOWN_ERROR_CODES.find((candidate) => message.includes(candidate)) ?? null
  );
}

export function toApiResponseError(error: unknown): ApiResponseError {
  const routeStatus = readNumberProperty(error, "status");
  const routeCode = readStringProperty(error, "code");
  if (routeStatus != null && routeCode != null && error instanceof Error) {
    return createApiResponseError({
      kind: kindFromStatus(routeStatus),
      status: routeStatus,
      code: routeCode,
      message: error.message,
    });
  }

  const knownCode = resolveKnownCode(error);
  if (knownCode) {
    const response = KNOWN_ERROR_RESPONSES[knownCode];
    return createApiResponseError({
      kind: response.kind,
      status: response.status,
      code: knownCode,
      message: response.message,
    });
  }

  return createInternalApiError();
}

export function toApiErrorResponseResultEffect(
  error: unknown,
): Effect.Effect<ApiErrorResponseResult> {
  return Effect.succeed(error).pipe(
    Effect.map(toApiResponseError),
    Effect.map((apiError) => ({
      status: apiError.status,
      body: {
        error: {
          code: apiError.code,
          message: apiError.message,
        },
      },
    })),
  );
}

export function toApiErrorResponseResult(
  error: unknown,
): ApiErrorResponseResult {
  return Effect.runSync(toApiErrorResponseResultEffect(error));
}
