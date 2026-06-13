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
  createPeriod(
    input: CreateBudgetPeriodInput,
  ): Effect.Effect<BudgetPeriodRecord, Error>;
  updatePeriod(
    input: UpdateBudgetPeriodInput,
  ): Effect.Effect<BudgetPeriodRecord, Error>;
}
