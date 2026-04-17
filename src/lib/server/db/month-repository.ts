export type BudgetStatus = "unset" | "set";

export type MonthRecord = {
  yearMonth: string;
  budgetYen: number | null;
  budgetStatus: BudgetStatus;
  initializedFromPreviousMonth: boolean;
  carriedFromYearMonth: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PreviousMonthBudget = {
  yearMonth: string;
  budgetYen: number;
};

export type CreateMonthInput = {
  yearMonth: string;
  budgetYen: number | null;
  budgetStatus: BudgetStatus;
  initializedFromPreviousMonth: boolean;
  carriedFromYearMonth: string | null;
  nowIso: string;
};

export interface MonthRepository {
  findMonth(yearMonth: string): Promise<MonthRecord | null>;
  findPreviousMonthWithBudget(yearMonth: string): Promise<PreviousMonthBudget | null>;
  createMonthIfAbsent(input: CreateMonthInput): Promise<MonthRecord>;
  updateBudget(yearMonth: string, budgetYen: number, nowIso: string): Promise<MonthRecord>;
  countMonths(): Promise<number>;
}

export type InMemoryMonthRepository = MonthRepository & {
  dumpSnapshot(): MonthRecord[];
};

function assertYearMonth(value: string): void {
  const matched = /^(\d{4})-(\d{2})$/.exec(value);
  if (!matched) {
    throw new Error(`Invalid yearMonth: ${value}`);
  }

  const month = Number(matched[2]);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Invalid yearMonth: ${value}`);
  }
}

export function toPreviousYearMonth(yearMonth: string): string {
  assertYearMonth(yearMonth);
  const [year, month] = yearMonth.split("-").map(Number);
  if (month === 1) {
    return `${String(year - 1).padStart(4, "0")}-12`;
  }

  return `${String(year).padStart(4, "0")}-${String(month - 1).padStart(2, "0")}`;
}

function cloneMonth(month: MonthRecord): MonthRecord {
  return { ...month };
}

export function createInMemoryMonthRepository(
  initialMonths: MonthRecord[] = []
): InMemoryMonthRepository {
  const store = new Map<string, MonthRecord>();
  for (const month of initialMonths) {
    store.set(month.yearMonth, cloneMonth(month));
  }

  return {
    async findMonth(yearMonth) {
      assertYearMonth(yearMonth);
      const found = store.get(yearMonth);
      return found ? cloneMonth(found) : null;
    },

    async findPreviousMonthWithBudget(yearMonth) {
      const previousYearMonth = toPreviousYearMonth(yearMonth);
      const previous = store.get(previousYearMonth);
      if (!previous || previous.budgetStatus !== "set" || previous.budgetYen == null) {
        return null;
      }

      return {
        yearMonth: previous.yearMonth,
        budgetYen: previous.budgetYen
      };
    },

    async createMonthIfAbsent(input) {
      assertYearMonth(input.yearMonth);
      const existing = store.get(input.yearMonth);
      if (existing) {
        return cloneMonth(existing);
      }

      const next: MonthRecord = {
        yearMonth: input.yearMonth,
        budgetYen: input.budgetYen,
        budgetStatus: input.budgetStatus,
        initializedFromPreviousMonth: input.initializedFromPreviousMonth,
        carriedFromYearMonth: input.carriedFromYearMonth,
        createdAt: input.nowIso,
        updatedAt: input.nowIso
      };
      store.set(input.yearMonth, next);
      return cloneMonth(next);
    },

    async updateBudget(yearMonth, budgetYen, nowIso) {
      assertYearMonth(yearMonth);
      const existing = store.get(yearMonth);
      if (!existing) {
        throw new Error(`month not found: ${yearMonth}`);
      }

      const updated: MonthRecord = {
        ...existing,
        budgetYen,
        budgetStatus: "set",
        updatedAt: nowIso
      };
      store.set(yearMonth, updated);
      return cloneMonth(updated);
    },

    async countMonths() {
      return store.size;
    },

    dumpSnapshot() {
      return [...store.values()]
        .map((month) => cloneMonth(month))
        .sort((left, right) => left.yearMonth.localeCompare(right.yearMonth));
    }
  };
}
