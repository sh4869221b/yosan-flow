import type { PeriodSummaryRevision } from "$lib/dashboard/period-summary-revision";

export type PeriodSummaryRequest = {
  readonly periodId: string | null;
  readonly revision: number;
  readonly sequence: number;
};

export function createPeriodSummaryRequestTracker(
  summaryRevision: PeriodSummaryRevision,
) {
  let latestSequence = 0;

  return {
    start(periodId: string | null): PeriodSummaryRequest {
      return {
        periodId,
        revision: periodId == null ? 0 : summaryRevision.get(periodId),
        sequence: ++latestSequence,
      };
    },
    owns(request: PeriodSummaryRequest): boolean {
      return request.sequence === latestSequence;
    },
    isFresh(request: PeriodSummaryRequest): boolean {
      return (
        request.sequence === latestSequence &&
        request.periodId != null &&
        summaryRevision.get(request.periodId) === request.revision
      );
    },
  };
}
