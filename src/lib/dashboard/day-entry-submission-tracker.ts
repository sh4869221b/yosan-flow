import type { PeriodSummary } from "$lib/dashboard/controller-types";
import type { PeriodSummaryRevision } from "$lib/dashboard/period-summary-revision";

type SuccessfulSummaryCandidate = {
  readonly mutationSequence: number;
  readonly summary: PeriodSummary;
};

export function createDayEntrySubmissionTracker(
  summaryRevision: PeriodSummaryRevision,
) {
  const activeCounts = new Map<string, number>();
  const bestSuccessfulSummaries = new Map<string, SuccessfulSummaryCandidate>();
  const summaryMutationSequences = new Map<string, number>();

  function owns(periodId: string, sequence?: number): boolean {
    const batchSequence = sequence ?? summaryMutationSequences.get(periodId);
    return (
      batchSequence != null &&
      summaryRevision.ownsMutation(periodId, batchSequence)
    );
  }

  return {
    start(periodId: string): void {
      if (!activeCounts.has(periodId)) {
        summaryMutationSequences.set(
          periodId,
          summaryRevision.beginMutation(periodId),
        );
      }
      activeCounts.set(periodId, (activeCounts.get(periodId) ?? 0) + 1);
    },
    finish(periodId: string): number {
      const remaining = (activeCounts.get(periodId) ?? 1) - 1;
      if (remaining === 0) {
        activeCounts.delete(periodId);
      } else {
        activeCounts.set(periodId, remaining);
      }
      return remaining;
    },
    accept(
      periodId: string,
      summary: PeriodSummary,
      submittedMutationSequence: number,
      currentMutationSequence: number,
    ): boolean {
      const currentBest = bestSuccessfulSummaries.get(periodId);
      const accepted =
        summary.periodId === periodId &&
        owns(periodId) &&
        submittedMutationSequence === currentMutationSequence &&
        (currentBest == null ||
          currentBest.mutationSequence !== currentMutationSequence ||
          summary.plannedTotalYen > currentBest.summary.plannedTotalYen);
      if (accepted) {
        bestSuccessfulSummaries.set(periodId, {
          mutationSequence: currentMutationSequence,
          summary,
        });
      }
      return accepted;
    },
    getBest(
      periodId: string,
      currentMutationSequence: number,
    ): PeriodSummary | null {
      const candidate = bestSuccessfulSummaries.get(periodId);
      return candidate?.mutationSequence === currentMutationSequence
        ? candidate.summary
        : null;
    },
    clearBest(periodId: string): void {
      bestSuccessfulSummaries.delete(periodId);
      summaryMutationSequences.delete(periodId);
    },
    hasActive(periodId: string): boolean {
      return activeCounts.has(periodId);
    },
  };
}
