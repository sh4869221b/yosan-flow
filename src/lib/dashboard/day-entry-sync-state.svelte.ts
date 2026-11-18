import { Effect } from "effect";
import { SvelteMap } from "svelte/reactivity";
import { runClientEffect } from "#lib/dashboard/client-effect.ts";

export function createDayEntrySyncState(
  getSelectedPeriodId: () => string | null,
) {
  const pending = new SvelteMap<string, { readonly date: string }>();
  const refreshing = new SvelteMap<string, true>();

  return {
    markPending(periodId: string, date: string): void {
      pending.set(periodId, { date });
    },
    captureSummarySync(periodId: string): (() => void) | undefined {
      const saved = pending.get(periodId);
      if (saved === undefined) return;
      return () => {
        if (pending.get(periodId) === saved) pending.delete(periodId);
      };
    },
    get pending() {
      const periodId = getSelectedPeriodId();
      return periodId !== null && pending.has(periodId);
    },
    get refreshing() {
      const periodId = getSelectedPeriodId();
      return periodId !== null && refreshing.has(periodId);
    },
    retry(
      refresh: (_periodId: string, _date: string) => Effect.Effect<void, never>,
    ): void {
      const periodId = getSelectedPeriodId();
      if (periodId === null || refreshing.has(periodId)) return;
      const saved = pending.get(periodId);
      if (saved === undefined) return;
      refreshing.set(periodId, true);
      runClientEffect(
        refresh(periodId, saved.date).pipe(
          Effect.ensuring(
            Effect.sync(() => {
              refreshing.delete(periodId);
            }),
          ),
        ),
      );
    },
  };
}
