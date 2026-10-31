import type { PeriodSummary } from "#lib/dashboard/controller-types.ts";

export function getDashboardToday(
  summary: PeriodSummary | null,
  fallback: string,
): string {
  return (
    summary?.dailyRows.find((row) => row.label === "today")?.date ?? fallback
  );
}
