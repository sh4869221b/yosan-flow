import type { Effect } from "effect";

type BudgetPeriodStatus = "active" | "closed";

export type BudgetPeriodRecord = {
  id: string;
  startDate: string;
  endDate: string;
  budgetYen: number;
  status: BudgetPeriodStatus;
  predecessorPeriodId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateBudgetPeriodInput = {
  id: string;
  startDate: string;
  endDate: string;
  budgetYen: number;
  status?: BudgetPeriodStatus;
  predecessorPeriodId?: string | null;
  nowIso: string;
};

export type UpdateBudgetPeriodInput = {
  id: string;
  startDate: string;
  endDate: string;
  budgetYen?: number;
  nowIso: string;
};

export type LinkedPeriodBoundaryAfter = {
  readonly id: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly budgetYen: number;
};

// Constructed only after the request has been parsed and the proposal derived.
// The brand makes construction of a fresh raw command require an explicit assertion.
declare const trustedLinkedBoundary: unique symbol;
export type LinkedPeriodBoundaryUpdateCommand = {
  readonly [trustedLinkedBoundary]: true;
  readonly target: {
    readonly before: Readonly<BudgetPeriodRecord>;
    readonly after: LinkedPeriodBoundaryAfter;
  };
  readonly successor: {
    readonly before: Readonly<BudgetPeriodRecord>;
    readonly after: LinkedPeriodBoundaryAfter;
  };
  readonly nowIso: string;
};

export type LinkedPeriodBoundaryUpdateResult = {
  readonly changedCount: 2;
  readonly target: BudgetPeriodRecord;
  readonly successor: BudgetPeriodRecord;
};

export class LinkedPeriodBoundaryConflictError extends Error {
  readonly code = "PERIOD_UPDATE_CONFLICT";

  constructor() {
    super("linked period boundary state changed");
    this.name = "LinkedPeriodBoundaryConflictError";
  }
}

export class LinkedPeriodBoundaryInvariantError extends Error {
  readonly code = "LINKED_PERIOD_BOUNDARY_INVARIANT";
  readonly changedCount: number;

  constructor(changedCount: number) {
    super(`linked period boundary update changed ${changedCount} rows`);
    this.name = "LinkedPeriodBoundaryInvariantError";
    this.changedCount = changedCount;
  }
}

export class PeriodValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PeriodValidationError";
    this.code = code;
  }
}

export class PeriodNotFoundError extends Error {
  readonly code = "PERIOD_NOT_FOUND";

  constructor(periodId: string) {
    super(`period not found: ${periodId}`);
    this.name = "PeriodNotFoundError";
  }
}

// Mutation inputs are internal commands: request fields have been validated at
// ingress, and newly derived ranges have been checked before persistence.
// Implementations still enforce relationships with current stored state.
export interface BudgetPeriodRepository {
  findById(id: string): Effect.Effect<BudgetPeriodRecord | null, Error>;
  findByDate(date: string): Effect.Effect<BudgetPeriodRecord | null, Error>;
  listPeriods(): Effect.Effect<BudgetPeriodRecord[], Error>;
  findSuccessorsByPredecessorId(
    predecessorPeriodId: string,
  ): Effect.Effect<BudgetPeriodRecord[], Error>;
  createPeriod(
    input: CreateBudgetPeriodInput,
  ): Effect.Effect<BudgetPeriodRecord, Error>;
  updatePeriod(
    input: UpdateBudgetPeriodInput,
  ): Effect.Effect<BudgetPeriodRecord, Error>;
  updateBudget(input: {
    id: string;
    budgetYen: number;
    nowIso: string;
  }): Effect.Effect<BudgetPeriodRecord, Error>;
  updateLinkedBoundary(
    command: LinkedPeriodBoundaryUpdateCommand,
  ): Effect.Effect<LinkedPeriodBoundaryUpdateResult, Error>;
}
