import { Effect } from "effect";
import { SvelteMap } from "svelte/reactivity";
import { runClientEffect } from "#lib/dashboard/client-effect.ts";

export function createDayEntrySyncState(
  getSelectedPeriodId: () => string | null,
) {
  const pending = new SvelteMap<string, string>();
  const refreshing = new SvelteMap<string, true>();

  return {
    markPending(periodId: string, date: string): void {
      pending.set(periodId, date);
    },
    markSynchronized(periodId: string): void {
      pending.delete(periodId);
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
      const date = pending.get(periodId);
      if (date === undefined) return;
      refreshing.set(periodId, true);
      runClientEffect(
        refresh(periodId, date).pipe(
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
