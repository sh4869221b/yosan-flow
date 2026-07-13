import type { PeriodSummary } from "$lib/dashboard/controller-types";
import type { PeriodSummaryRevision } from "$lib/dashboard/period-summary-revision";

type SuccessfulSummaryCandidate = {
  readonly mutationSequence: number;
  readonly summary: PeriodSummary;
  readonly summarySequence: number;
};

export function createDayEntrySubmissionTracker(
  summaryRevision: PeriodSummaryRevision,
) {
  const activeCounts = new Map<string, number>();
  const generationCounts = new Map<string, Map<number, number>>();
  const bestSuccessfulSummaries = new Map<string, SuccessfulSummaryCandidate>();
  const summaryMutationSequences = new Map<string, number>();

  function isFresh(periodId: string, sequence?: number): boolean {
    const batchSequence = sequence ?? summaryMutationSequences.get(periodId);
    return (
      batchSequence != null &&
      summaryRevision.isMutationFresh(periodId, batchSequence)
    );
  }

  return {
    start(periodId: string): number {
      const currentSequence = summaryMutationSequences.get(periodId);
      if (currentSequence == null || !isFresh(periodId, currentSequence)) {
        summaryMutationSequences.set(
          periodId,
          summaryRevision.beginMutation(periodId),
        );
        bestSuccessfulSummaries.delete(periodId);
      }
      const sequence = summaryMutationSequences.get(periodId) ?? 0;
      const periodGenerations = generationCounts.get(periodId) ?? new Map();
      periodGenerations.set(
        sequence,
        (periodGenerations.get(sequence) ?? 0) + 1,
      );
      generationCounts.set(periodId, periodGenerations);
      activeCounts.set(periodId, (activeCounts.get(periodId) ?? 0) + 1);
      return sequence;
    },
    finish(periodId: string, summarySequence: number): number {
      summaryRevision.observeMutationCompletion(periodId, summarySequence);
      const periodGenerations = generationCounts.get(periodId);
      const generationRemaining =
        (periodGenerations?.get(summarySequence) ?? 1) - 1;
      if (generationRemaining === 0) {
        periodGenerations?.delete(summarySequence);
        summaryRevision.completeMutation(periodId, summarySequence);
      } else {
        periodGenerations?.set(summarySequence, generationRemaining);
      }
      if (periodGenerations?.size === 0) {
        generationCounts.delete(periodId);
      }
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
      submittedSummarySequence: number,
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
          summarySequence: submittedSummarySequence,
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
    bestIsMutationFresh(periodId: string): boolean {
      const candidate = bestSuccessfulSummaries.get(periodId);
      return candidate != null && isFresh(periodId, candidate.summarySequence);
    },
    shouldReconcile(periodId: string): boolean {
      return !summaryRevision.isMutationActive(periodId);
    },
  };
}
