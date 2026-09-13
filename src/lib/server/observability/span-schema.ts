import { ROUTE_TEMPLATES, type RouteTemplate } from "./route";

export const CUSTOM_SPAN_NAMES = [
  "api.budget_period.create",
  "api.budget_period.update",
  "api.budget_period.linked_boundary.propose",
  "api.budget_period.linked_boundary.confirm",
  "api.daily_total.upsert",
  "api.history.update",
  "api.history.delete",
  "summary.calculate",
] as const;

export type CustomSpanName = (typeof CUSTOM_SPAN_NAMES)[number];

export type CustomSpanAttributes = {
  readonly "app.operation": CustomSpanName;
  readonly "app.route"?: RouteTemplate;
};

export function isCustomSpanName(input: unknown): input is CustomSpanName {
  return CUSTOM_SPAN_NAMES.some((name) => name === input);
}

export function sanitizeSpanAttributes(
  name: CustomSpanName,
  input: unknown,
): CustomSpanAttributes | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  if (
    !Object.hasOwn(input, "app.operation") ||
    Reflect.get(input, "app.operation") !== name
  ) {
    return undefined;
  }
  const rawRoute = Object.hasOwn(input, "app.route")
    ? Reflect.get(input, "app.route")
    : undefined;
  const route = ROUTE_TEMPLATES.find((value) => value === rawRoute);
  return {
    "app.operation": name,
    ...(route === undefined ? {} : { "app.route": route }),
  };
}
