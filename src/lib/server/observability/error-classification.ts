import {
  isTelemetryErrorCode,
  type TelemetryErrorCode,
  type TelemetryEvent,
} from "./schema";

export function classifyApiError(
  status: number,
  code: string,
): {
  readonly outcome: Exclude<TelemetryEvent["outcome"], "success">;
  readonly error_code: TelemetryErrorCode;
} {
  const error_code = isTelemetryErrorCode(code) ? code : "UNKNOWN_ERROR";
  if (status >= 500 || error_code === "INTERNAL_ERROR") {
    return { outcome: "unexpected_error", error_code };
  }
  if (
    status === 409 ||
    error_code === "PERIOD_OVERLAP" ||
    error_code === "PERIOD_MULTIPLE_SUCCESSORS" ||
    error_code === "PERIOD_UPDATE_CONFLICT" ||
    error_code === "PERIOD_BOUNDARY_CONFIRMATION_REQUIRED"
  ) {
    return { outcome: "conflict", error_code };
  }
  return {
    outcome: status >= 400 && status < 500 ? "validation" : "unexpected_error",
    error_code,
  };
}
