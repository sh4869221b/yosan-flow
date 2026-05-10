import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import { Effect } from "effect";
import type { D1Database } from "$lib/server/db/d1-types";
import { toEffectError } from "$lib/server/effect/runtime";
import * as schema from "$lib/server/db/schema";

type DatabaseState<P = unknown, D = unknown, H = unknown> = {
  budgetPeriods: Map<string, P>;
  dailyTotals: Map<string, D>;
  dailyOperationHistories: H[];
};

export type DatabaseTransaction<P = unknown, D = unknown, H = unknown> = {
  state: DatabaseState<P, D, H>;
};

export interface DatabaseClient<P = unknown, D = unknown, H = unknown> {
  transaction<T>(
    work: (tx: DatabaseTransaction<P, D, H>) => Effect.Effect<T, Error>,
  ): Effect.Effect<T, Error>;
  read<T>(
    work: (tx: DatabaseTransaction<P, D, H>) => Effect.Effect<T, Error>,
  ): Effect.Effect<T, Error>;
  dumpState(): DatabaseState<P, D, H>;
}

// Boundary: D1 bindings enter Drizzle here. Repositories may use this for typed
// SQL construction/row mapping; service/domain rules stay above this layer.
export function createDrizzleD1Database(
  db: D1Database,
): DrizzleD1Database<typeof schema> {
  return drizzle(db, { schema });
}

type CreateClientInput<P, D, H> = {
  initialState?: Partial<DatabaseState<P, D, H>>;
};

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function cloneState<P, D, H>(
  state: DatabaseState<P, D, H>,
): DatabaseState<P, D, H> {
  return {
    budgetPeriods: new Map(
      [...state.budgetPeriods.entries()].map(([key, value]) => [
        key,
        cloneValue(value),
      ]),
    ),
    dailyTotals: new Map(
      [...state.dailyTotals.entries()].map(([key, value]) => [
        key,
        cloneValue(value),
      ]),
    ),
    dailyOperationHistories: state.dailyOperationHistories.map((value) =>
      cloneValue(value),
    ),
  };
}

export function createInMemoryDatabaseClient<
  P = unknown,
  D = unknown,
  H = unknown,
>(input: CreateClientInput<P, D, H> = {}): DatabaseClient<P, D, H> {
  let currentState: DatabaseState<P, D, H> = {
    budgetPeriods: new Map(input.initialState?.budgetPeriods ?? []),
    dailyTotals: new Map(input.initialState?.dailyTotals ?? []),
    dailyOperationHistories: [
      ...(input.initialState?.dailyOperationHistories ?? []),
    ],
  };
  let transactionQueue: Promise<void> = Promise.resolve();

  return {
    transaction<T>(
      work: (tx: DatabaseTransaction<P, D, H>) => Effect.Effect<T, Error>,
    ) {
      return Effect.gen(function* () {
        const pending = transactionQueue;
        let releaseQueue: (() => void) | undefined;
        transactionQueue = new Promise<void>((resolve) => {
          releaseQueue = resolve;
        });

        yield* Effect.tryPromise({
          try: () => pending,
          catch: toEffectError,
        });

        const txState = cloneState(currentState);
        return yield* work({ state: txState }).pipe(
          Effect.tap((result) =>
            Effect.sync(() => {
              currentState = txState;
              return result;
            }),
          ),
          Effect.ensuring(
            Effect.sync(() => {
              releaseQueue?.();
            }),
          ),
        );
      });
    },

    read<T>(
      work: (tx: DatabaseTransaction<P, D, H>) => Effect.Effect<T, Error>,
    ) {
      const readState = cloneState(currentState);
      return work({ state: readState });
    },

    dumpState() {
      return cloneState(currentState);
    },
  };
}
