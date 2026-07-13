import type { PeriodSummary } from "$lib/dashboard/controller-types";

type SuccessfulSummaryCandidate = {
  readonly mutationSequence: number;
  readonly summary: PeriodSummary;
};

export function createDayEntrySubmissionTracker() {
  const activeCounts = new Map<string, number>();
  const bestSuccessfulSummaries = new Map<string, SuccessfulSummaryCandidate>();

  return {
    start(periodId: string): void {
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
    },
    hasActive(periodId: string): boolean {
      return activeCounts.has(periodId);
    },
  };
}
