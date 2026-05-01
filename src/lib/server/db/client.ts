export type DatabaseState<P = unknown, D = unknown, H = unknown> = {
  budgetPeriods: Map<string, P>;
  dailyTotals: Map<string, D>;
  dailyOperationHistories: H[];
};

export type DatabaseTransaction<P = unknown, D = unknown, H = unknown> = {
  state: DatabaseState<P, D, H>;
};

export interface DatabaseClient<P = unknown, D = unknown, H = unknown> {
  transaction<T>(
    work: (tx: DatabaseTransaction<P, D, H>) => Promise<T>,
  ): Promise<T>;
  read<T>(work: (tx: DatabaseTransaction<P, D, H>) => Promise<T>): Promise<T>;
  dumpState(): DatabaseState<P, D, H>;
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
    async transaction<T>(
      work: (tx: DatabaseTransaction<P, D, H>) => Promise<T>,
    ) {
      const pending = transactionQueue;
      let releaseQueue: (() => void) | undefined;
      transactionQueue = new Promise<void>((resolve) => {
        releaseQueue = resolve;
      });

      await pending;

      try {
        const txState = cloneState(currentState);
        const result = await work({ state: txState });
        currentState = txState;
        return result;
      } finally {
        releaseQueue?.();
      }
    },

    async read<T>(work: (tx: DatabaseTransaction<P, D, H>) => Promise<T>) {
      const readState = cloneState(currentState);
      return work({ state: readState });
    },

    dumpState() {
      return cloneState(currentState);
    },
  };
}
