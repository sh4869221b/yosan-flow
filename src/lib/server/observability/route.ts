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
