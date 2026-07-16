type Dependencies = {
  readonly getSelectedDate: () => string | null;
  readonly getSelectedPeriodId: () => string | null;
};

export function createHistoryMutationTracker(dependencies: Dependencies) {
  let nextReservation = 0;
  let nextSequence = 0;
  const mutations = new Map<
    string,
    {
      date: string;
      historyId: string;
      reservation: number;
      sequence: number | null;
    }
  >();
  const latestSequences = new Map<string, number>();

  return {
    reserve(periodId: string, date: string, historyId: string): number | null {
      if (mutations.has(periodId)) return null;
      const reservation = ++nextReservation;
      mutations.set(periodId, {
        date,
        historyId,
        reservation,
        sequence: null,
      });
      return reservation;
    },
    activate(periodId: string, reservation: number): number | null {
      const mutation = mutations.get(periodId);
      if (mutation?.reservation !== reservation) return null;
      const sequence = ++nextSequence;
      latestSequences.set(periodId, sequence);
      mutation.sequence = sequence;
      return sequence;
    },
    finish(periodId: string, reservation: number): void {
      if (mutations.get(periodId)?.reservation === reservation) {
        mutations.delete(periodId);
      }
    },
    getSequence(periodId: string): number {
      return latestSequences.get(periodId) ?? 0;
    },
    getVisibleId(_version: number): string | null {
      const periodId = dependencies.getSelectedPeriodId();
      return periodId == null
        ? null
        : (mutations.get(periodId)?.historyId ?? null);
    },
    ownsPeriod(periodId: string, sequence: number): boolean {
      return (
        sequence === mutations.get(periodId)?.sequence &&
        sequence === latestSequences.get(periodId) &&
        dependencies.getSelectedPeriodId() === periodId
      );
    },
    ownsSelection(periodId: string, date: string, sequence: number): boolean {
      return (
        this.ownsPeriod(periodId, sequence) &&
        mutations.get(periodId)?.date === date &&
        dependencies.getSelectedDate() === date
      );
    },
  };
}
