import { addDays } from "#lib/dashboard/date.ts";
import type { PageData } from "../../routes/$types";

export function getInitialPeriodControllerState(data: PageData) {
  const periods = data.periods ?? [];
  return {
    createStartDate:
      periods.length > 0
        ? addDays(periods[periods.length - 1].endDate, 1)
        : data.today,
    periods,
    selectedPeriodId: data.selectedPeriodId,
    summary: data.summary,
  };
}
