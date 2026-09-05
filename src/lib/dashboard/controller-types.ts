import type { PageData } from "../../routes/$types";

export type PeriodSummary = NonNullable<PageData["summary"]>;
export type PeriodOption = PageData["periods"][number];
export type DailyRow = PeriodSummary["dailyRows"][number];

export type DaySaveSuccess = {
  readonly periodId: string;
  readonly date: string;
};

export type DayEntryCloseReason = "success" | "cancel" | "period-change";
