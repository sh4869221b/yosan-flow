export type PeriodSummaryRevision = {
  readonly advance: (_periodId: string) => number;
  readonly beginMutation: (_periodId: string) => number;
  readonly completeMutation: (_periodId: string, _sequence: number) => void;
  readonly get: (_periodId: string) => number;
  readonly getMutationSequence: (_periodId: string) => number;
  readonly isMutationActive: (_periodId: string) => boolean;
  readonly isMutationFresh: (_periodId: string, _sequence: number) => boolean;
  readonly observeMutationCompletion: (
    _periodId: string,
    _sequence: number,
  ) => void;
  readonly publish: <T extends { readonly periodId: string }>(
    _summary: T,
    _setSummary: (_summary: T) => void,
  ) => void;
};

export function createPeriodSummaryRevision(): PeriodSummaryRevision {
  const mutations = new Map<
    string,
    { active: boolean; dirty: boolean; sequence: number }
  >();
  const revisions = new Map<string, number>();

  return {
    advance(periodId: string): number {
      const nextRevision = (revisions.get(periodId) ?? 0) + 1;
      revisions.set(periodId, nextRevision);
      return nextRevision;
    },
    beginMutation(periodId: string): number {
      const nextSequence = (mutations.get(periodId)?.sequence ?? 0) + 1;
      mutations.set(periodId, {
        active: true,
        dirty: false,
        sequence: nextSequence,
      });
      return nextSequence;
    },
    completeMutation(periodId: string, sequence: number): void {
      this.observeMutationCompletion(periodId, sequence);
      const current = mutations.get(periodId);
      if (current?.sequence === sequence) {
        current.active = false;
      }
    },
    get(periodId: string): number {
      return revisions.get(periodId) ?? 0;
    },
    getMutationSequence(periodId: string): number {
      return mutations.get(periodId)?.sequence ?? 0;
    },
    isMutationActive(periodId: string): boolean {
      return mutations.get(periodId)?.active ?? false;
    },
    isMutationFresh(periodId: string, sequence: number): boolean {
      const mutation = mutations.get(periodId);
      return mutation?.sequence === sequence && !mutation.dirty;
    },
    observeMutationCompletion(periodId: string, sequence: number): void {
      const current = mutations.get(periodId);
      if (current != null && current.sequence !== sequence) {
        current.dirty = true;
      }
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
