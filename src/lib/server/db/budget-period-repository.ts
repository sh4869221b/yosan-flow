import { and, asc, eq, gte, lte, ne } from "drizzle-orm";
import { createDrizzleD1Database } from "$lib/server/db/client";
import type { D1Database } from "$lib/server/db/d1-types";
import { budget_periods, type BudgetPeriodRow } from "$lib/server/db/schema";
import {
  getNextPeriodStartDate,
  isDateWithinPeriod,
} from "$lib/server/domain/budget-period";

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

type CreateBudgetPeriodInput = {
  id: string;
  startDate: string;
  endDate: string;
  budgetYen: number;
  status?: BudgetPeriodStatus;
  predecessorPeriodId?: string | null;
  nowIso: string;
};

type UpdateBudgetPeriodInput = {
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

class PeriodNotFoundError extends Error {
  readonly code = "PERIOD_NOT_FOUND";

  constructor(periodId: string) {
    super(`period not found: ${periodId}`);
    this.name = "PeriodNotFoundError";
  }
}

export interface BudgetPeriodRepository {
  findById(id: string): Promise<BudgetPeriodRecord | null>;
  findByDate(date: string): Promise<BudgetPeriodRecord | null>;
  listPeriods(): Promise<BudgetPeriodRecord[]>;
  createPeriod(input: CreateBudgetPeriodInput): Promise<BudgetPeriodRecord>;
  updatePeriod(input: UpdateBudgetPeriodInput): Promise<BudgetPeriodRecord>;
}

function clonePeriod(record: BudgetPeriodRecord): BudgetPeriodRecord {
  return { ...record };
}

function assertNoOverlap(
  store: Map<string, BudgetPeriodRecord>,
  target: BudgetPeriodRecord,
): void {
  for (const current of store.values()) {
    if (current.id === target.id) {
      continue;
    }

    const overlaps =
      isDateWithinPeriod(
        target.startDate,
        current.startDate,
        current.endDate,
      ) ||
      isDateWithinPeriod(target.endDate, current.startDate, current.endDate) ||
      isDateWithinPeriod(current.startDate, target.startDate, target.endDate) ||
      isDateWithinPeriod(current.endDate, target.startDate, target.endDate);
    if (overlaps) {
      throw new PeriodValidationError(
        "PERIOD_OVERLAP",
        `budget period overlap: ${target.id} overlaps ${current.id}`,
      );
    }
  }
}

function assertValidBudgetYen(budgetYen: number): void {
  if (!Number.isInteger(budgetYen) || budgetYen < 0) {
    throw new Error(`Invalid budgetYen: ${budgetYen}`);
  }
}

function assertPredecessorContinuity(
  store: Map<string, BudgetPeriodRecord>,
  input: CreateBudgetPeriodInput,
): void {
  if (!input.predecessorPeriodId) {
    return;
  }

  const predecessor = store.get(input.predecessorPeriodId);
  if (!predecessor) {
    throw new PeriodValidationError(
      "PERIOD_PREDECESSOR_NOT_FOUND",
      `predecessor period not found: ${input.predecessorPeriodId}`,
    );
  }

  const expectedStartDate = getNextPeriodStartDate(predecessor.endDate);
  if (input.startDate !== expectedStartDate) {
    throw new PeriodValidationError(
      "PERIOD_CONTINUITY_VIOLATION",
      `period must start on ${expectedStartDate} after predecessor`,
    );
  }
}

function assertValidPeriodRange(startDate: string, endDate: string): void {
  try {
    isDateWithinPeriod(startDate, startDate, endDate);
  } catch {
    throw new PeriodValidationError(
      "INVALID_PERIOD_RANGE",
      `Invalid period: ${startDate}..${endDate}`,
    );
  }
}

function assertSuccessorContinuity(
  store: Map<string, BudgetPeriodRecord>,
  periodId: string,
  updatedEndDate: string,
): void {
  const expectedStartDate = getNextPeriodStartDate(updatedEndDate);
  for (const candidate of store.values()) {
    if (candidate.predecessorPeriodId !== periodId) {
      continue;
    }
    if (candidate.startDate !== expectedStartDate) {
      throw new PeriodValidationError(
        "PERIOD_CONTINUITY_VIOLATION",
        `successor period ${candidate.id} must start on ${expectedStartDate}`,
      );
    }
  }
}

function toBudgetPeriodRecord(row: BudgetPeriodRow): BudgetPeriodRecord {
  return {
    id: row.id,
    startDate: row.start_date,
    endDate: row.end_date,
    budgetYen: row.budget_yen,
    status: row.status,
    predecessorPeriodId: row.predecessor_period_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createInMemoryBudgetPeriodRepository(
  initialPeriods: BudgetPeriodRecord[] = [],
): BudgetPeriodRepository {
  const store = new Map<string, BudgetPeriodRecord>();
  for (const period of initialPeriods) {
    store.set(period.id, clonePeriod(period));
  }

  return {
    async findById(id) {
      const found = store.get(id);
      return found ? clonePeriod(found) : null;
    },

    async findByDate(date) {
      for (const period of store.values()) {
        if (isDateWithinPeriod(date, period.startDate, period.endDate)) {
          return clonePeriod(period);
        }
      }
      return null;
    },

    async listPeriods() {
      return [...store.values()]
        .map((period) => clonePeriod(period))
        .sort((left, right) => left.startDate.localeCompare(right.startDate));
    },

    async createPeriod(input) {
      assertValidBudgetYen(input.budgetYen);
      assertValidPeriodRange(input.startDate, input.endDate);
      assertPredecessorContinuity(store, input);

      const existing = store.get(input.id);
      if (existing) {
        return clonePeriod(existing);
      }

      const next: BudgetPeriodRecord = {
        id: input.id,
        startDate: input.startDate,
        endDate: input.endDate,
        budgetYen: input.budgetYen,
        status: input.status ?? "active",
        predecessorPeriodId: input.predecessorPeriodId ?? null,
        createdAt: input.nowIso,
        updatedAt: input.nowIso,
      };

      assertNoOverlap(store, next);
      store.set(next.id, next);
      return clonePeriod(next);
    },

    async updatePeriod(input) {
      assertValidBudgetYen(input.budgetYen);
      assertValidPeriodRange(input.startDate, input.endDate);
      const existing = store.get(input.id);
      if (!existing) {
        throw new PeriodNotFoundError(input.id);
      }

      const updated: BudgetPeriodRecord = {
        ...existing,
        startDate: input.startDate,
        endDate: input.endDate,
        budgetYen: input.budgetYen,
        updatedAt: input.nowIso,
      };

      assertNoOverlap(store, updated);
      if (updated.predecessorPeriodId) {
        const predecessor = store.get(updated.predecessorPeriodId);
        if (!predecessor) {
          throw new PeriodValidationError(
            "PERIOD_PREDECESSOR_NOT_FOUND",
            `predecessor period not found: ${updated.predecessorPeriodId}`,
          );
        }
        const expectedStartDate = getNextPeriodStartDate(predecessor.endDate);
        if (updated.startDate !== expectedStartDate) {
          throw new PeriodValidationError(
            "PERIOD_CONTINUITY_VIOLATION",
            `period must start on ${expectedStartDate} after predecessor`,
          );
        }
      }
      assertSuccessorContinuity(store, updated.id, updated.endDate);

      store.set(updated.id, updated);
      return clonePeriod(updated);
    },
  };
}

type CreateD1BudgetPeriodRepositoryInput = {
  db: D1Database;
  ensureSchema?: () => Promise<void>;
};

export function createD1BudgetPeriodRepository(
  input: CreateD1BudgetPeriodRepositoryInput,
): BudgetPeriodRepository {
  const ensureSchema = input.ensureSchema ?? (async () => {});
  const database = createDrizzleD1Database(input.db);
  const findByIdInternal = async (
    id: string,
  ): Promise<BudgetPeriodRecord | null> => {
    await ensureSchema();
    const [row] = await database
      .select()
      .from(budget_periods)
      .where(eq(budget_periods.id, id))
      .limit(1)
      .all();
    return row ? toBudgetPeriodRecord(row) : null;
  };

  return {
    async findById(id) {
      return findByIdInternal(id);
    },

    async findByDate(date) {
      await ensureSchema();
      const [row] = await database
        .select()
        .from(budget_periods)
        .where(
          and(
            lte(budget_periods.start_date, date),
            gte(budget_periods.end_date, date),
          ),
        )
        .orderBy(asc(budget_periods.start_date))
        .limit(1)
        .all();
      return row ? toBudgetPeriodRecord(row) : null;
    },

    async listPeriods() {
      await ensureSchema();
      const rows = await database
        .select()
        .from(budget_periods)
        .orderBy(asc(budget_periods.start_date))
        .all();
      return rows.map((row) => toBudgetPeriodRecord(row));
    },

    async createPeriod(inputRow) {
      await ensureSchema();
      assertValidBudgetYen(inputRow.budgetYen);
      assertValidPeriodRange(inputRow.startDate, inputRow.endDate);

      const existing = await findByIdInternal(inputRow.id);
      if (existing) {
        return existing;
      }

      if (inputRow.predecessorPeriodId) {
        const [predecessor] = await database
          .select({ end_date: budget_periods.end_date })
          .from(budget_periods)
          .where(eq(budget_periods.id, inputRow.predecessorPeriodId))
          .limit(1)
          .all();
        if (!predecessor) {
          throw new PeriodValidationError(
            "PERIOD_PREDECESSOR_NOT_FOUND",
            `predecessor period not found: ${inputRow.predecessorPeriodId}`,
          );
        }
        const expectedStartDate = getNextPeriodStartDate(predecessor.end_date);
        if (inputRow.startDate !== expectedStartDate) {
          throw new PeriodValidationError(
            "PERIOD_CONTINUITY_VIOLATION",
            `period must start on ${expectedStartDate} after predecessor`,
          );
        }
      }

      const [overlapped] = await database
        .select({ id: budget_periods.id })
        .from(budget_periods)
        .where(
          and(
            lte(budget_periods.start_date, inputRow.endDate),
            gte(budget_periods.end_date, inputRow.startDate),
          ),
        )
        .limit(1)
        .all();
      if (overlapped) {
        throw new PeriodValidationError(
          "PERIOD_OVERLAP",
          `budget period overlap: ${inputRow.id} overlaps ${overlapped.id}`,
        );
      }

      await database
        .insert(budget_periods)
        .values({
          id: inputRow.id,
          start_date: inputRow.startDate,
          end_date: inputRow.endDate,
          budget_yen: inputRow.budgetYen,
          status: inputRow.status ?? "active",
          predecessor_period_id: inputRow.predecessorPeriodId ?? null,
          created_at: inputRow.nowIso,
          updated_at: inputRow.nowIso,
        })
        .run();

      const created = await findByIdInternal(inputRow.id);
      if (!created) {
        throw new Error(`budget period not found after create: ${inputRow.id}`);
      }
      return created;
    },

    async updatePeriod(inputRow) {
      await ensureSchema();
      assertValidBudgetYen(inputRow.budgetYen);
      assertValidPeriodRange(inputRow.startDate, inputRow.endDate);

      const existing = await findByIdInternal(inputRow.id);
      if (!existing) {
        throw new PeriodNotFoundError(inputRow.id);
      }
      if (existing.predecessorPeriodId) {
        const [predecessor] = await database
          .select({ end_date: budget_periods.end_date })
          .from(budget_periods)
          .where(eq(budget_periods.id, existing.predecessorPeriodId))
          .limit(1)
          .all();
        if (!predecessor) {
          throw new PeriodValidationError(
            "PERIOD_PREDECESSOR_NOT_FOUND",
            `predecessor period not found: ${existing.predecessorPeriodId}`,
          );
        }
        const expectedStartDate = getNextPeriodStartDate(predecessor.end_date);
        if (inputRow.startDate !== expectedStartDate) {
          throw new PeriodValidationError(
            "PERIOD_CONTINUITY_VIOLATION",
            `period must start on ${expectedStartDate} after predecessor`,
          );
        }
      }

      const successors = await database
        .select({
          id: budget_periods.id,
          start_date: budget_periods.start_date,
        })
        .from(budget_periods)
        .where(eq(budget_periods.predecessor_period_id, inputRow.id))
        .all();
      const expectedSuccessorStartDate = getNextPeriodStartDate(
        inputRow.endDate,
      );
      for (const row of successors) {
        if (row.start_date !== expectedSuccessorStartDate) {
          throw new PeriodValidationError(
            "PERIOD_CONTINUITY_VIOLATION",
            `successor period ${row.id} must start on ${expectedSuccessorStartDate}`,
          );
        }
      }

      const [overlapped] = await database
        .select({ id: budget_periods.id })
        .from(budget_periods)
        .where(
          and(
            ne(budget_periods.id, inputRow.id),
            lte(budget_periods.start_date, inputRow.endDate),
            gte(budget_periods.end_date, inputRow.startDate),
          ),
        )
        .limit(1)
        .all();
      if (overlapped) {
        throw new PeriodValidationError(
          "PERIOD_OVERLAP",
          `budget period overlap: ${inputRow.id} overlaps ${overlapped.id}`,
        );
      }

      await database
        .update(budget_periods)
        .set({
          start_date: inputRow.startDate,
          end_date: inputRow.endDate,
          budget_yen: inputRow.budgetYen,
          updated_at: inputRow.nowIso,
        })
        .where(eq(budget_periods.id, inputRow.id))
        .run();

      const updated = await findByIdInternal(inputRow.id);
      if (!updated) {
        throw new Error(`period not found after update: ${inputRow.id}`);
      }
      return updated;
    },
  };
}
