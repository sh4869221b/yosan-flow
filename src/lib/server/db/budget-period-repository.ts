import type { D1Database } from "$lib/server/db/d1-types";
import { getNextPeriodStartDate, isDateWithinPeriod } from "$lib/server/domain/budget-period";

export type BudgetPeriodStatus = "active" | "closed";

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
  findById(id: string): Promise<BudgetPeriodRecord | null>;
  findByDate(date: string): Promise<BudgetPeriodRecord | null>;
  listPeriods(): Promise<BudgetPeriodRecord[]>;
  createPeriod(input: CreateBudgetPeriodInput): Promise<BudgetPeriodRecord>;
  updatePeriod(input: UpdateBudgetPeriodInput): Promise<BudgetPeriodRecord>;
}

function clonePeriod(record: BudgetPeriodRecord): BudgetPeriodRecord {
  return { ...record };
}

function assertNoOverlap(store: Map<string, BudgetPeriodRecord>, target: BudgetPeriodRecord): void {
  for (const current of store.values()) {
    if (current.id === target.id) {
      continue;
    }

    const overlaps =
      isDateWithinPeriod(target.startDate, current.startDate, current.endDate) ||
      isDateWithinPeriod(target.endDate, current.startDate, current.endDate) ||
      isDateWithinPeriod(current.startDate, target.startDate, target.endDate) ||
      isDateWithinPeriod(current.endDate, target.startDate, target.endDate);
    if (overlaps) {
      throw new PeriodValidationError(
        "PERIOD_OVERLAP",
        `budget period overlap: ${target.id} overlaps ${current.id}`
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
  input: CreateBudgetPeriodInput
): void {
  if (!input.predecessorPeriodId) {
    return;
  }

  const predecessor = store.get(input.predecessorPeriodId);
  if (!predecessor) {
    throw new PeriodValidationError(
      "PERIOD_PREDECESSOR_NOT_FOUND",
      `predecessor period not found: ${input.predecessorPeriodId}`
    );
  }

  const expectedStartDate = getNextPeriodStartDate(predecessor.endDate);
  if (input.startDate !== expectedStartDate) {
    throw new PeriodValidationError(
      "PERIOD_CONTINUITY_VIOLATION",
      `period must start on ${expectedStartDate} after predecessor`
    );
  }
}

function assertValidPeriodRange(startDate: string, endDate: string): void {
  try {
    isDateWithinPeriod(startDate, startDate, endDate);
  } catch {
    throw new PeriodValidationError(
      "INVALID_PERIOD_RANGE",
      `Invalid period: ${startDate}..${endDate}`
    );
  }
}

function assertSuccessorContinuity(
  store: Map<string, BudgetPeriodRecord>,
  periodId: string,
  updatedEndDate: string
): void {
  const expectedStartDate = getNextPeriodStartDate(updatedEndDate);
  for (const candidate of store.values()) {
    if (candidate.predecessorPeriodId !== periodId) {
      continue;
    }
    if (candidate.startDate !== expectedStartDate) {
      throw new PeriodValidationError(
        "PERIOD_CONTINUITY_VIOLATION",
        `successor period ${candidate.id} must start on ${expectedStartDate}`
      );
    }
  }
}

function toBudgetPeriodRecord(row: {
  id: string;
  start_date: string;
  end_date: string;
  budget_yen: number;
  status: BudgetPeriodStatus;
  predecessor_period_id: string | null;
  created_at: string;
  updated_at: string;
}): BudgetPeriodRecord {
  return {
    id: row.id,
    startDate: row.start_date,
    endDate: row.end_date,
    budgetYen: row.budget_yen,
    status: row.status,
    predecessorPeriodId: row.predecessor_period_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function createInMemoryBudgetPeriodRepository(
  initialPeriods: BudgetPeriodRecord[] = []
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
        updatedAt: input.nowIso
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
        updatedAt: input.nowIso
      };

      assertNoOverlap(store, updated);
      if (updated.predecessorPeriodId) {
        const predecessor = store.get(updated.predecessorPeriodId);
        if (!predecessor) {
          throw new PeriodValidationError(
            "PERIOD_PREDECESSOR_NOT_FOUND",
            `predecessor period not found: ${updated.predecessorPeriodId}`
          );
        }
        const expectedStartDate = getNextPeriodStartDate(predecessor.endDate);
        if (updated.startDate !== expectedStartDate) {
          throw new PeriodValidationError(
            "PERIOD_CONTINUITY_VIOLATION",
            `period must start on ${expectedStartDate} after predecessor`
          );
        }
      }
      assertSuccessorContinuity(store, updated.id, updated.endDate);

      store.set(updated.id, updated);
      return clonePeriod(updated);
    }
  };
}

type CreateD1BudgetPeriodRepositoryInput = {
  db: D1Database;
  ensureSchema?: () => Promise<void>;
};

export function createD1BudgetPeriodRepository(
  input: CreateD1BudgetPeriodRepositoryInput
): BudgetPeriodRepository {
  const ensureSchema = input.ensureSchema ?? (async () => {});
  const findByIdInternal = async (id: string): Promise<BudgetPeriodRecord | null> => {
    await ensureSchema();
    const row = await input.db
      .prepare(
        `SELECT id, start_date, end_date, budget_yen, status, predecessor_period_id, created_at, updated_at
           FROM budget_periods
          WHERE id = ?`
      )
      .bind(id)
      .first<{
        id: string;
        start_date: string;
        end_date: string;
        budget_yen: number;
        status: BudgetPeriodStatus;
        predecessor_period_id: string | null;
        created_at: string;
        updated_at: string;
      }>();
    return row ? toBudgetPeriodRecord(row) : null;
  };

  return {
    async findById(id) {
      return findByIdInternal(id);
    },

    async findByDate(date) {
      await ensureSchema();
      const row = await input.db
        .prepare(
          `SELECT id, start_date, end_date, budget_yen, status, predecessor_period_id, created_at, updated_at
             FROM budget_periods
            WHERE start_date <= ?
              AND end_date >= ?
            ORDER BY start_date ASC
            LIMIT 1`
        )
        .bind(date, date)
        .first<{
          id: string;
          start_date: string;
          end_date: string;
          budget_yen: number;
          status: BudgetPeriodStatus;
          predecessor_period_id: string | null;
          created_at: string;
          updated_at: string;
        }>();
      return row ? toBudgetPeriodRecord(row) : null;
    },

    async listPeriods() {
      await ensureSchema();
      const result = await input.db
        .prepare(
          `SELECT id, start_date, end_date, budget_yen, status, predecessor_period_id, created_at, updated_at
             FROM budget_periods
            ORDER BY start_date ASC`
        )
        .all<{
          id: string;
          start_date: string;
          end_date: string;
          budget_yen: number;
          status: BudgetPeriodStatus;
          predecessor_period_id: string | null;
          created_at: string;
          updated_at: string;
        }>();
      return (result.results ?? []).map((row) => toBudgetPeriodRecord(row));
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
        const predecessor = await input.db
          .prepare(`SELECT end_date FROM budget_periods WHERE id = ?`)
          .bind(inputRow.predecessorPeriodId)
          .first<{ end_date: string }>();
        if (!predecessor) {
          throw new PeriodValidationError(
            "PERIOD_PREDECESSOR_NOT_FOUND",
            `predecessor period not found: ${inputRow.predecessorPeriodId}`
          );
        }
        const expectedStartDate = getNextPeriodStartDate(predecessor.end_date);
        if (inputRow.startDate !== expectedStartDate) {
          throw new PeriodValidationError(
            "PERIOD_CONTINUITY_VIOLATION",
            `period must start on ${expectedStartDate} after predecessor`
          );
        }
      }

      const overlapped = await input.db
        .prepare(
          `SELECT id
             FROM budget_periods
            WHERE start_date <= ?
              AND end_date >= ?
            LIMIT 1`
        )
        .bind(inputRow.endDate, inputRow.startDate)
        .first<{ id: string }>();
      if (overlapped) {
        throw new PeriodValidationError(
          "PERIOD_OVERLAP",
          `budget period overlap: ${inputRow.id} overlaps ${overlapped.id}`
        );
      }

      await input.db
        .prepare(
          `INSERT INTO budget_periods (
             id, start_date, end_date, budget_yen, status, predecessor_period_id, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          inputRow.id,
          inputRow.startDate,
          inputRow.endDate,
          inputRow.budgetYen,
          inputRow.status ?? "active",
          inputRow.predecessorPeriodId ?? null,
          inputRow.nowIso,
          inputRow.nowIso
        )
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
        const predecessor = await input.db
          .prepare(`SELECT end_date FROM budget_periods WHERE id = ?`)
          .bind(existing.predecessorPeriodId)
          .first<{ end_date: string }>();
        if (!predecessor) {
          throw new PeriodValidationError(
            "PERIOD_PREDECESSOR_NOT_FOUND",
            `predecessor period not found: ${existing.predecessorPeriodId}`
          );
        }
        const expectedStartDate = getNextPeriodStartDate(predecessor.end_date);
        if (inputRow.startDate !== expectedStartDate) {
          throw new PeriodValidationError(
            "PERIOD_CONTINUITY_VIOLATION",
            `period must start on ${expectedStartDate} after predecessor`
          );
        }
      }

      const successor = await input.db
        .prepare(
          `SELECT id, start_date
             FROM budget_periods
            WHERE predecessor_period_id = ?`
        )
        .bind(inputRow.id)
        .all<{ id: string; start_date: string }>();
      const expectedSuccessorStartDate = getNextPeriodStartDate(inputRow.endDate);
      for (const row of successor.results ?? []) {
        if (row.start_date !== expectedSuccessorStartDate) {
          throw new PeriodValidationError(
            "PERIOD_CONTINUITY_VIOLATION",
            `successor period ${row.id} must start on ${expectedSuccessorStartDate}`
          );
        }
      }

      const overlapped = await input.db
        .prepare(
          `SELECT id
             FROM budget_periods
            WHERE id <> ?
              AND start_date <= ?
              AND end_date >= ?
            LIMIT 1`
        )
        .bind(inputRow.id, inputRow.endDate, inputRow.startDate)
        .first<{ id: string }>();
      if (overlapped) {
        throw new PeriodValidationError(
          "PERIOD_OVERLAP",
          `budget period overlap: ${inputRow.id} overlaps ${overlapped.id}`
        );
      }

      await input.db
        .prepare(
          `UPDATE budget_periods
              SET start_date = ?,
                  end_date = ?,
                  budget_yen = ?,
                  updated_at = ?
            WHERE id = ?`
        )
        .bind(
          inputRow.startDate,
          inputRow.endDate,
          inputRow.budgetYen,
          inputRow.nowIso,
          inputRow.id
        )
        .run();

      const updated = await findByIdInternal(inputRow.id);
      if (!updated) {
        throw new Error(`period not found after update: ${inputRow.id}`);
      }
      return updated;
    }
  };
}
