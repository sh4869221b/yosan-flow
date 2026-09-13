import { ROUTE_TEMPLATES, type RouteTemplate } from "./route";

export const OPERATIONS = [
  "period.list",
  "period.create",
  "period.read",
  "period.update",
  "day.add",
  "day.overwrite",
  "history.list",
  "history.update",
  "history.delete",
] as const;

export type Operation = (typeof OPERATIONS)[number];

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

  return { event, operation, route, method, outcome, status };
}
