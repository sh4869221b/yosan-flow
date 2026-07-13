export type PeriodSummaryRevision = {
  readonly advance: (_periodId: string) => number;
  readonly beginMutation: (_periodId: string) => number;
  readonly get: (_periodId: string) => number;
  readonly ownsMutation: (_periodId: string, _sequence: number) => boolean;
  readonly publish: <T extends { readonly periodId: string }>(
    _summary: T,
    _setSummary: (_summary: T) => void,
  ) => void;
};

export function createPeriodSummaryRevision(): PeriodSummaryRevision {
  const mutationSequences = new Map<string, number>();
  const revisions = new Map<string, number>();

  return {
    advance(periodId: string): number {
      const nextRevision = (revisions.get(periodId) ?? 0) + 1;
      revisions.set(periodId, nextRevision);
      return nextRevision;
    },
    beginMutation(periodId: string): number {
      const nextSequence = (mutationSequences.get(periodId) ?? 0) + 1;
      mutationSequences.set(periodId, nextSequence);
      return nextSequence;
    },
    get(periodId: string): number {
      return revisions.get(periodId) ?? 0;
    },
    ownsMutation(periodId: string, sequence: number): boolean {
      return mutationSequences.get(periodId) === sequence;
    },
    publish<T extends { readonly periodId: string }>(
      summary: T,
      setSummary: (_summary: T) => void,
    ): void {
      this.advance(summary.periodId);
      setSummary(summary);
    },
  };
}
