import type { PeriodSummary } from "$lib/dashboard/controller-types";
import type {
  HistoryItem,
  HistoryMutationResponse,
} from "$lib/dashboard/types";
import { summaryConfigurationMatches } from "$lib/dashboard/summary-rows";

const MAX_RETAINED_HISTORY_ENTRIES = 32;

type RetainedHistories = {
  readonly histories: readonly HistoryItem[];
  readonly mutationSequence: number;
  readonly revision: number;
  readonly summary: PeriodSummary;
};

function entryKey(periodId: string, date: string): string {
  return JSON.stringify([periodId, date]);
}

export function createRetainedHistoryStore(
  maxEntries = MAX_RETAINED_HISTORY_ENTRIES,
) {
  const entries = new Map<string, RetainedHistories>();

  return {
    clear(periodId: string, date: string): void {
      entries.delete(entryKey(periodId, date));
    },
    replay(
      periodId: string,
      date: string,
      revision: number,
      mutationSequence: number,
      currentSummary: PeriodSummary | null,
    ): {
      readonly histories: readonly HistoryItem[] | null;
      readonly invalidated: boolean;
    } {
      const key = entryKey(periodId, date);
      const retained = entries.get(key);
      if (retained == null) {
        return { histories: null, invalidated: false };
      }
      const retainedIsFresh =
        retained.revision <= revision &&
        retained.mutationSequence === mutationSequence &&
        currentSummary?.periodId === periodId &&
        summaryConfigurationMatches(retained.summary, currentSummary);
      if (retainedIsFresh) {
        return { histories: retained.histories, invalidated: false };
      }
      entries.delete(key);
      return { histories: null, invalidated: true };
    },
    retain(
      periodId: string,
      date: string,
      body: HistoryMutationResponse<PeriodSummary>,
      revision: number,
      mutationSequence: number,
    ): void {
      const key = entryKey(periodId, date);
      entries.delete(key);
      entries.set(key, {
        histories: [...body.histories],
        mutationSequence,
        revision,
        summary: body.summary,
      });
      if (entries.size > maxEntries) {
        const oldestKey = entries.keys().next().value;
        if (oldestKey != null) entries.delete(oldestKey);
      }
    },
  };
}
