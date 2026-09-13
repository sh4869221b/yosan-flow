export const ROUTE_TEMPLATES = [
  "/api/periods",
  "/api/periods/[periodId]",
  "/api/periods/[periodId]/days/[date]/add",
  "/api/periods/[periodId]/days/[date]/overwrite",
  "/api/periods/[periodId]/days/[date]/history",
  "/api/periods/[periodId]/days/[date]/history/[historyId]",
  "unknown",
] as const;

export type RouteTemplate = (typeof ROUTE_TEMPLATES)[number];

const routePatterns = ROUTE_TEMPLATES.filter(
  (template) => template !== "unknown",
).map((template) => ({
  template,
  pattern: new RegExp(`^${template.replace(/\[[^/]+?\]/g, "[^/]+")}/?$`),
}));

export function normalizeRoute(pathname: string): RouteTemplate {
  const path = pathname.replace(/[?#][\s\S]*$/, "");
  return (
    routePatterns.find(({ pattern }) => pattern.test(path))?.template ??
    "unknown"
  );
}
