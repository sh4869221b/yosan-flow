export type DatabaseState<M = unknown, D = unknown, H = unknown> = {
  monthlyBudgets: Map<string, M>;
  dailyTotals: Map<string, D>;
  dailyOperationHistories: H[];
};

export type DatabaseTransaction<M = unknown, D = unknown, H = unknown> = {
  state: DatabaseState<M, D, H>;
};

export interface DatabaseClient<M = unknown, D = unknown, H = unknown> {
  transaction<T>(work: (tx: DatabaseTransaction<M, D, H>) => Promise<T>): Promise<T>;
  read<T>(work: (tx: DatabaseTransaction<M, D, H>) => Promise<T>): Promise<T>;
  dumpState(): DatabaseState<M, D, H>;
}

type CreateClientInput<M, D, H> = {
  initialState?: Partial<DatabaseState<M, D, H>>;
};

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function cloneState<M, D, H>(state: DatabaseState<M, D, H>): DatabaseState<M, D, H> {
  return {
    monthlyBudgets: new Map(
      [...state.monthlyBudgets.entries()].map(([key, value]) => [key, cloneValue(value)])
    ),
    dailyTotals: new Map(
      [...state.dailyTotals.entries()].map(([key, value]) => [key, cloneValue(value)])
    ),
    dailyOperationHistories: state.dailyOperationHistories.map((value) => cloneValue(value))
  };
}

export function createInMemoryDatabaseClient<M = unknown, D = unknown, H = unknown>(
  input: CreateClientInput<M, D, H> = {}
): DatabaseClient<M, D, H> {
  let currentState: DatabaseState<M, D, H> = {
    monthlyBudgets: new Map(input.initialState?.monthlyBudgets ?? []),
    dailyTotals: new Map(input.initialState?.dailyTotals ?? []),
    dailyOperationHistories: [...(input.initialState?.dailyOperationHistories ?? [])]
  };

  return {
    async transaction<T>(work) {
      const txState = cloneState(currentState);
      const result = await work({ state: txState });
      currentState = txState;
      return result;
    },

    async read<T>(work) {
      const readState = cloneState(currentState);
      return work({ state: readState });
    },

    dumpState() {
      return cloneState(currentState);
    }
  };
}
