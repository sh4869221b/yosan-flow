export type PeriodSummaryRevision = {
  readonly advance: (_periodId: string) => number;
  readonly get: (_periodId: string) => number;
  readonly publish: <T extends { readonly periodId: string }>(
    _summary: T,
    _setSummary: (_summary: T) => void,
  ) => void;
};

export function createPeriodSummaryRevision(): PeriodSummaryRevision {
  const revisions = new Map<string, number>();

  return {
    advance(periodId: string): number {
      const nextRevision = (revisions.get(periodId) ?? 0) + 1;
      revisions.set(periodId, nextRevision);
      return nextRevision;
    },
    get(periodId: string): number {
      return revisions.get(periodId) ?? 0;
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
