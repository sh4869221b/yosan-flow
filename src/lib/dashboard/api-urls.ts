import { resolve } from "$app/paths";

export function periodsUrl(): string {
  return resolve("/api/periods");
}

export function periodSummaryUrl(periodId: string): string {
  return resolve("/api/periods/[periodId]", {
    periodId: encodeURIComponent(periodId),
  });
}

export function dayHistoryUrl(periodId: string, date: string): string {
  return resolve("/api/periods/[periodId]/days/[date]/history", {
    periodId: encodeURIComponent(periodId),
    date: encodeURIComponent(date),
  });
}

export function dayAddUrl(periodId: string, date: string): string {
  return resolve("/api/periods/[periodId]/days/[date]/add", {
    periodId: encodeURIComponent(periodId),
    date: encodeURIComponent(date),
  });
}

export function historyItemUrl(
  periodId: string,
  date: string,
  historyId: string,
): string {
  return resolve("/api/periods/[periodId]/days/[date]/history/[historyId]", {
    periodId: encodeURIComponent(periodId),
    date: encodeURIComponent(date),
    historyId: encodeURIComponent(historyId),
  });
}
