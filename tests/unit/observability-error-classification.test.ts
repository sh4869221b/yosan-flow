import { describe, expect, it } from "vitest";
import { classifyApiError } from "$lib/server/observability/error-classification";

describe("API telemetry error classification", () => {
  it.each([
    [400, "INVALID_BODY", "validation", "INVALID_BODY"],
    [404, "PERIOD_NOT_FOUND", "validation", "PERIOD_NOT_FOUND"],
    [404, "HISTORY_NOT_FOUND", "validation", "HISTORY_NOT_FOUND"],
    [400, "PERIOD_OVERLAP", "conflict", "PERIOD_OVERLAP"],
    [409, "PERIOD_UPDATE_CONFLICT", "conflict", "PERIOD_UPDATE_CONFLICT"],
    [
      409,
      "PERIOD_BOUNDARY_CONFIRMATION_REQUIRED",
      "conflict",
      "PERIOD_BOUNDARY_CONFIRMATION_REQUIRED",
    ],
    [500, "PERIOD_OVERLAP", "unexpected_error", "PERIOD_OVERLAP"],
    [400, "INTERNAL_ERROR", "unexpected_error", "INTERNAL_ERROR"],
    [400, "private-code-1234", "validation", "UNKNOWN_ERROR"],
    [409, "private-code-1234", "conflict", "UNKNOWN_ERROR"],
    [500, "private-code-1234", "unexpected_error", "UNKNOWN_ERROR"],
    [200, "private-code-1234", "unexpected_error", "UNKNOWN_ERROR"],
  ] as const)(
    "classifies %i / %s without copying private codes",
    (status, code, outcome, error_code) => {
      expect(classifyApiError(status, code)).toEqual({ outcome, error_code });
    },
  );
});
