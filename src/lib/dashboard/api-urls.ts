import { resolve } from "$app/paths";
import {
  isDotPeriodId,
  LEGACY_PERIOD_PATH,
  LEGACY_PERIOD_QUERY,
} from "#lib/period-id.ts";

function resolvePeriodId(
  periodId: string,
  path: (segment: string) => string,
): string {
  return isDotPeriodId(periodId)
    ? path(LEGACY_PERIOD_PATH) +
        "?" +
        new URLSearchParams({ [LEGACY_PERIOD_QUERY]: periodId })
    : path(encodeURIComponent(periodId));
}

export function periodsUrl(): string {
  return resolve("/api/periods");
}

export function periodSummaryUrl(periodId: string): string {
  return resolvePeriodId(periodId, (segment) =>
    resolve("/api/periods/[periodId]", { periodId: segment }),
  );
}

export function dayHistoryUrl(periodId: string, date: string): string {
  return resolvePeriodId(periodId, (segment) =>
    resolve("/api/periods/[periodId]/days/[date]/history", {
      periodId: segment,
      date: encodeURIComponent(date),
    }),
  );
}

export function dayAddUrl(periodId: string, date: string): string {
  return resolvePeriodId(periodId, (segment) =>
    resolve("/api/periods/[periodId]/days/[date]/add", {
      periodId: segment,
      date: encodeURIComponent(date),
    }),
  );
}

export function historyItemUrl(
  periodId: string,
  date: string,
  historyId: string,
): string {
  return resolvePeriodId(periodId, (segment) =>
    resolve("/api/periods/[periodId]/days/[date]/history/[historyId]", {
      periodId: segment,
      date: encodeURIComponent(date),
      historyId: encodeURIComponent(historyId),
    }),
  );
}
