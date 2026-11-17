import type { BudgetPeriodRecord } from "#lib/server/db/budget-period-types.ts";

export function selectDashboardPeriodId(
  periods: readonly BudgetPeriodRecord[],
  preferredId: string | null,
  today: string,
): string | null {
  if (
    preferredId !== null &&
    periods.some((period) => period.id === preferredId)
  )
    return preferredId;

  const current = periods.find(
    (period) =>
      period.status === "active" &&
      period.startDate <= today &&
      today <= period.endDate,
  );
  return current?.id ?? periods.at(-1)?.id ?? null;
}
