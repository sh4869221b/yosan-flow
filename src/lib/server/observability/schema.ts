import { ROUTE_TEMPLATES, type RouteTemplate } from "./route";

export const OPERATIONS = [
  "period.list",
  "period.create",
  "period.read",
  "period.update",
  "period.boundary.propose",
  "period.boundary.confirm",
  "day.add",
  "day.overwrite",
  "history.list",
  "history.update",
  "history.delete",
] as const;

export type Operation = (typeof OPERATIONS)[number];

const ERROR_CODES = [
  "INVALID_PERIOD_ID",
  "INVALID_BODY",
  "INVALID_AMOUNT",
  "INVALID_DATE",
  "INVALID_HISTORY_ID",
  "INVALID_MEMO",
  "DATE_OUT_OF_PERIOD",
  "PERIOD_CONTINUITY_VIOLATION",
  "PERIOD_PREDECESSOR_NOT_FOUND",
  "INVALID_PERIOD_RANGE",
  "PERIOD_HAS_OUT_OF_RANGE_ENTRIES",
  "PERIOD_NOT_FOUND",
  "HISTORY_NOT_FOUND",
  "PERIOD_OVERLAP",
  "PERIOD_MULTIPLE_SUCCESSORS",
  "PERIOD_UPDATE_CONFLICT",
  "PERIOD_BOUNDARY_CONFIRMATION_REQUIRED",
  "INTERNAL_ERROR",
  "UNKNOWN_ERROR",
] as const;

export type TelemetryErrorCode = (typeof ERROR_CODES)[number];

export function isTelemetryErrorCode(
  input: unknown,
): input is TelemetryErrorCode {
  return ERROR_CODES.some((code) => code === input);
}

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
const OUTCOMES = [
  "success",
  "validation",
  "conflict",
  "unexpected_error",
] as const;

export type TelemetryEvent = {
  readonly event: "operation.completed";
  readonly operation: Operation;
  readonly route: RouteTemplate;
  readonly method: (typeof METHODS)[number];
  readonly outcome: (typeof OUTCOMES)[number];
  readonly status: number;
  readonly error_code?: TelemetryErrorCode;
};

export function isOperation(input: unknown): input is Operation {
  return OPERATIONS.some((operation) => operation === input);
}

function ownField(input: object, key: string): unknown {
  return Object.hasOwn(input, key) ? Reflect.get(input, key) : undefined;
}

export function sanitizeEvent(input: unknown): TelemetryEvent | undefined {
  if (typeof input !== "object" || input === null) return undefined;

  const event = ownField(input, "event");
  const operation = ownField(input, "operation");
  const rawRoute = ownField(input, "route");
  const rawMethod = ownField(input, "method");
  const rawOutcome = ownField(input, "outcome");
  const status = ownField(input, "status");
  const errorCode = ownField(input, "error_code");
  const route = ROUTE_TEMPLATES.find((value) => value === rawRoute);
  const method = METHODS.find((value) => value === rawMethod);
  const outcome = OUTCOMES.find((value) => value === rawOutcome);

  if (
    event !== "operation.completed" ||
    !isOperation(operation) ||
    route === undefined ||
    method === undefined ||
    outcome === undefined ||
    typeof status !== "number" ||
    !Number.isInteger(status) ||
    status < 100 ||
    status > 599
  ) {
    return undefined;
  }

  return {
    event,
    operation,
    route,
    method,
    outcome,
    status,
    ...(isTelemetryErrorCode(errorCode) ? { error_code: errorCode } : {}),
  };
}
