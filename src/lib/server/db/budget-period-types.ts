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
  budgetYen: number;
  nowIso: string;
};

export type LinkedPeriodBoundaryAfter = {
  readonly id: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly budgetYen: number;
};

export type LinkedPeriodBoundaryUpdateCommand = {
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
  updateLinkedBoundary(
    command: LinkedPeriodBoundaryUpdateCommand,
  ): Effect.Effect<LinkedPeriodBoundaryUpdateResult, Error>;
}
