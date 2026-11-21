export const LEGACY_PERIOD_PATH = "_legacy";
export const LEGACY_PERIOD_QUERY = "legacyPeriodId";

export function isDotPeriodId(value: unknown): value is "." | ".." {
  return value === "." || value === "..";
}
