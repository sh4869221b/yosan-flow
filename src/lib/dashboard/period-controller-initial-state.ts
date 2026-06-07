import { addDays } from "$lib/dashboard/date";
import type {
  PeriodOption,
  PeriodSummary,
} from "$lib/dashboard/controller-types";
import type { PageData } from "../../routes/$types";

export type InitialPeriodControllerState = {
  readonly createStartDate: string;
  readonly periods: PeriodOption[];
  readonly selectedPeriodId: string | null;
  readonly summary: PeriodSummary | null;
  readonly today: string;
};

export function getInitialPeriodControllerState(
  data: PageData,
): InitialPeriodControllerState {
  const periods = data.periods ?? [];
  const today = data.today;
  return {
    createStartDate:
      periods.length > 0
        ? addDays(periods[periods.length - 1].endDate, 1)
        : today,
    periods,
    selectedPeriodId: data.selectedPeriodId,
    summary: data.summary,
    today,
  };
}
