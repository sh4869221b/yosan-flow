import { Equal } from "effect";
import type { PeriodSummary } from "#lib/dashboard/controller-types.ts";
import { mergeAddedSummary } from "#lib/dashboard/summary-rows.ts";
import type { PeriodSummaryRevision } from "#lib/dashboard/period-summary-revision.ts";

type SuccessfulSummaryCandidate = {
  readonly acceptSummaries: readonly (() => void)[];
  readonly mutationSequence: number;
  readonly summary: PeriodSummary;
};

export function createDayEntrySubmissionTracker(
  summaryRevision: PeriodSummaryRevision,
) {
  const activeCounts = new Map<string, number>();
  const generationCounts = new Map<string, Map<number, number>>();
  const bestSuccessfulSummaries = new Map<string, SuccessfulSummaryCandidate>();
  const summaryMutationSequences = new Map<string, number>();

  return {
    start(periodId: string): number {
      let sequence = summaryMutationSequences.get(periodId);
      if (
        sequence == null ||
        !summaryRevision.isMutationFresh(periodId, sequence)
      ) {
        sequence = summaryRevision.beginMutation(periodId);
        summaryMutationSequences.set(periodId, sequence);
        bestSuccessfulSummaries.delete(periodId);
      }
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
      submittedMutationSequence: number,
      currentMutationSequence: number,
      acceptSummary?: () => void,
    ): boolean {
      const currentBest = bestSuccessfulSummaries.get(periodId);
      const accepted =
        summary.periodId === periodId &&
        submittedMutationSequence === currentMutationSequence;
      if (accepted) {
        const previous =
          currentBest?.mutationSequence === currentMutationSequence
            ? currentBest
            : undefined;
        const merged = mergeAddedSummary(summary, previous?.summary ?? null);
        bestSuccessfulSummaries.set(periodId, {
          acceptSummaries: retainMatchingAcknowledgements(
            summary,
            merged,
            acceptSummary,
            previous,
          ),
          mutationSequence: currentMutationSequence,
          summary: merged,
        });
      }
      return accepted;
    },
    getBest(
      periodId: string,
      currentMutationSequence: number,
    ): SuccessfulSummaryCandidate | null {
      const candidate = bestSuccessfulSummaries.get(periodId);
      return candidate?.mutationSequence === currentMutationSequence
        ? candidate
        : null;
    },
    clearBest(periodId: string): void {
      bestSuccessfulSummaries.delete(periodId);
      summaryMutationSequences.delete(periodId);
    },
    hasActive(periodId: string): boolean {
      return activeCounts.has(periodId);
    },
    shouldReconcile(periodId: string): boolean {
      return !summaryRevision.isMutationActive(periodId);
    },
  };
}

function retainMatchingAcknowledgements(
  response: PeriodSummary,
  merged: PeriodSummary,
  acceptSummary: (() => void) | undefined,
  previous: SuccessfulSummaryCandidate | undefined,
): readonly (() => void)[] {
  if (!acceptSummary && !previous?.acceptSummaries.length) return [];
  // A later response that disagrees with the provisional merge invalidates
  // earlier confirmations, even if the merge itself remains unchanged.
  if (!Equal.equals(merged, response)) return [];
  const retained =
    previous && Equal.equals(merged, previous.summary)
      ? previous.acceptSummaries
      : [];
  return acceptSummary && !retained.includes(acceptSummary)
    ? [...retained, acceptSummary]
    : retained;
}
