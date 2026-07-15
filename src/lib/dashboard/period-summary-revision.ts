import { Effect } from "effect";

type MutationKind = "add" | "history" | "period";

export type PeriodSummaryRevision = {
  readonly withMutationSlot: <A, E, R>(
    _periodId: string,
    _kind: MutationKind,
    _effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>;
  readonly advance: (_periodId: string) => number;
  readonly awaitMutationSettlement: (
    _periodId: string,
    _sequence: number,
  ) => Effect.Effect<void>;
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
  type MutationWaiter = {
    cancelled: boolean;
    granted: boolean;
    readonly kind: MutationKind;
    release?: () => void;
    readonly resume: (_effect: Effect.Effect<() => void>) => void;
  };
  type MutationQueue = {
    activeCount: number;
    activeKind: MutationKind;
    readonly waiting: MutationWaiter[];
  };

  const mutations = new Map<
    string,
    {
      active: boolean;
      readonly completion: Promise<void>;
      dirty: boolean;
      readonly resolveCompletion: () => void;
      readonly sequence: number;
    }
  >();
  const mutationQueues = new Map<string, MutationQueue>();
  const revisions = new Map<string, number>();

  function grantMutationSlot(
    periodId: string,
    queue: MutationQueue,
    waiter: MutationWaiter,
  ): void {
    if (waiter.cancelled) return;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      queue.activeCount -= 1;
      if (queue.activeCount > 0) return;
      let firstWaiter = queue.waiting.shift();
      while (firstWaiter?.cancelled) {
        firstWaiter = queue.waiting.shift();
      }
      if (firstWaiter == null) {
        mutationQueues.delete(periodId);
        return;
      }
      queue.activeKind = firstWaiter.kind;
      const nextWaiters = [firstWaiter];
      if (firstWaiter.kind === "add") {
        while (queue.waiting[0]?.kind === "add") {
          const nextWaiter = queue.waiting.shift();
          if (nextWaiter != null && !nextWaiter.cancelled) {
            nextWaiters.push(nextWaiter);
          }
        }
      }
      queue.activeCount = nextWaiters.length;
      for (const nextWaiter of nextWaiters) {
        grantMutationSlot(periodId, queue, nextWaiter);
      }
    };
    waiter.release = release;
    waiter.granted = true;
    waiter.resume(Effect.succeed(release));
  }

  function acquireMutationSlot(
    periodId: string,
    kind: MutationKind,
  ): Effect.Effect<() => void> {
    return Effect.async((resume) => {
      const waiter: MutationWaiter = {
        cancelled: false,
        granted: false,
        kind,
        resume,
      };
      const queue = mutationQueues.get(periodId);
      if (queue == null) {
        const nextQueue = { activeCount: 1, activeKind: kind, waiting: [] };
        mutationQueues.set(periodId, nextQueue);
        grantMutationSlot(periodId, nextQueue, waiter);
      } else if (
        kind === "add" &&
        queue.activeKind === "add" &&
        queue.waiting.length === 0
      ) {
        queue.activeCount += 1;
        grantMutationSlot(periodId, queue, waiter);
      } else {
        queue.waiting.push(waiter);
      }
      return Effect.sync(() => {
        waiter.cancelled = true;
        if (waiter.granted) {
          waiter.release?.();
          return;
        }
        const currentQueue = mutationQueues.get(periodId);
        const index = currentQueue?.waiting.indexOf(waiter) ?? -1;
        if (index >= 0) currentQueue?.waiting.splice(index, 1);
      });
    });
  }

  return {
    withMutationSlot<A, E, R>(
      periodId: string,
      kind: MutationKind,
      effect: Effect.Effect<A, E, R>,
    ): Effect.Effect<A, E, R> {
      return Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          const release = yield* restore(acquireMutationSlot(periodId, kind));
          return yield* restore(effect).pipe(
            Effect.ensuring(Effect.sync(release)),
          );
        }),
      );
    },
    advance(periodId: string): number {
      const nextRevision = (revisions.get(periodId) ?? 0) + 1;
      revisions.set(periodId, nextRevision);
      return nextRevision;
    },
    awaitMutationSettlement(
      periodId: string,
      sequence: number,
    ): Effect.Effect<void> {
      const mutation = mutations.get(periodId);
      if (mutation?.active !== true || mutation.sequence !== sequence) {
        return Effect.void;
      }
      return Effect.promise(() => mutation.completion);
    },
    beginMutation(periodId: string): number {
      const current = mutations.get(periodId);
      current?.resolveCompletion();
      const nextSequence = (current?.sequence ?? 0) + 1;
      let resolveCompletion = (): void => undefined;
      const completion = new Promise<void>((resolve) => {
        resolveCompletion = resolve;
      });
      mutations.set(periodId, {
        active: true,
        completion,
        dirty: false,
        resolveCompletion,
        sequence: nextSequence,
      });
      return nextSequence;
    },
    completeMutation(periodId: string, sequence: number): void {
      this.observeMutationCompletion(periodId, sequence);
      const current = mutations.get(periodId);
      if (current?.sequence === sequence) {
        current.active = false;
        current.resolveCompletion();
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
