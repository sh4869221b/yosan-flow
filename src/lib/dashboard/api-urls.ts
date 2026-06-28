export function periodsUrl(): string {
  return "/api/periods";
}

export function periodSummaryUrl(periodId: string): string {
  return `/api/periods/${encodeURIComponent(periodId)}`;
}

export function dayHistoryUrl(periodId: string, date: string): string {
  return `/api/periods/${encodeURIComponent(periodId)}/days/${encodeURIComponent(date)}/history`;
}

export function dayAddUrl(periodId: string, date: string): string {
  return `/api/periods/${encodeURIComponent(periodId)}/days/${encodeURIComponent(date)}/add`;
}

export function historyItemUrl(
  periodId: string,
  date: string,
  historyId: string,
): string {
  return `/api/periods/${encodeURIComponent(periodId)}/days/${encodeURIComponent(date)}/history/${encodeURIComponent(historyId)}`;
}
