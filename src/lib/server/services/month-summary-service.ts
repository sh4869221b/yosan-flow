import { createInMemoryDatabaseClient, type DatabaseClient } from "$lib/server/db/client";
import type { D1Database } from "$lib/server/db/d1-types";
import {
  createDailyHistoryRepository,
  type DailyHistoryRecord,
  type DailyHistoryRepository
} from "$lib/server/db/daily-history-repository";
import {
  createDailyTotalRepository,
  type DailyTotalRecord,
  type DailyTotalRepository
} from "$lib/server/db/daily-total-repository";
import {
  createTransactionalMonthRepository,
  toPreviousYearMonth,
  type MonthRecord,
  type MonthRepository,
  type PreviousMonthBudget,
  type TransactionalMonthRepository
} from "$lib/server/db/month-repository";
import { assertValidDate, assertValidInputYen, normalizeMemo, toYearMonth } from "$lib/server/domain/daily-entry";
import { buildDailyRecommendations } from "$lib/server/domain/reallocation";
import { BudgetNotSetError, DayEntryService } from "$lib/server/services/day-entry-service";
import { getJstDateParts } from "$lib/server/time/jst";

export type MonthStatus = "ready" | "uninitialized";

export type DailyRow = {
  date: string;
  label: "today" | "planned";
  usedYen: number;
  recommendedYen: number;
};

export type MonthSummaryDailyTotal = {
  date: string;
  yearMonth: string;
  totalUsedYen: number;
};

export type MonthSummary = {
  yearMonth: string;
  monthStatus: MonthStatus;
  budgetYen: number | null;
  budgetStatus: "unset" | "set";
  initializedFromPreviousMonth: boolean;
  carriedFromYearMonth: string | null;
  suggestedInitialBudgetYen: number | null;
  spentToDateYen: number;
  plannedTotalYen: number;
  remainingYen: number;
  overspentYen: number;
  todayRecommendedYen: number;
  daysRemaining: number;
  dailyRows: DailyRow[];
};

export type DayEntryServicePort = {
  addDailyAmount(command: { date: string; inputYen: number; memo?: string | null }): Promise<unknown>;
  overwriteDailyAmount(command: { date: string; inputYen: number; memo?: string | null }): Promise<unknown>;
};

export type InitializeMonthInput = {
  yearMonth: string;
  budgetYen?: number;
  nowIso: string;
};

export type UpsertMonthBudgetInput = {
  yearMonth: string;
  budgetYen: number;
  nowIso: string;
};

export type BuildMonthSummaryOptions = {
  jstToday?: string;
  dailyTotals?: MonthSummaryDailyTotal[];
};

function getDaysInMonth(yearMonth: string): number {
  const [year, month] = yearMonth.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function toDateString(yearMonth: string, day: number): string {
  return `${yearMonth}-${String(day).padStart(2, "0")}`;
}

function buildDateRange(startDate: string, endDate: string): string[] {
  if (startDate > endDate) {
    return [];
  }

  const rows: string[] = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    rows.push(cursor);
    const [year, month, day] = cursor.split("-").map(Number);
    const next = new Date(Date.UTC(year, month - 1, day + 1));
    const nextYear = next.getUTCFullYear();
    const nextMonth = String(next.getUTCMonth() + 1).padStart(2, "0");
    const nextDay = String(next.getUTCDate()).padStart(2, "0");
    cursor = `${nextYear}-${nextMonth}-${nextDay}`;
  }
  return rows;
}

function buildDailyTotalMap(
  yearMonth: string,
  dailyTotals: MonthSummaryDailyTotal[]
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of dailyTotals) {
    if (row.yearMonth !== yearMonth) {
      continue;
    }
    map.set(row.date, (map.get(row.date) ?? 0) + row.totalUsedYen);
  }
  return map;
}

function resolveVisibleDates(yearMonth: string, jstToday: string): string[] {
  const todayYearMonth = jstToday.slice(0, 7);
  const startDate =
    yearMonth === todayYearMonth ? jstToday : `${yearMonth}-${String(1).padStart(2, "0")}`;
  const endDate = toDateString(yearMonth, getDaysInMonth(yearMonth));
  return buildDateRange(startDate, endDate);
}

export async function buildMonthSummary(
  monthRepository: MonthRepository,
  yearMonth: string,
  options: BuildMonthSummaryOptions = {}
): Promise<MonthSummary> {
  const jstToday = options.jstToday ?? getJstDateParts(new Date()).date;
  const dailyTotals = options.dailyTotals ?? [];
  const daysInMonth = getDaysInMonth(yearMonth);
  const dailyTotalsByDate = buildDailyTotalMap(yearMonth, dailyTotals);
  const plannedTotalYen = [...dailyTotalsByDate.values()].reduce((total, current) => total + current, 0);
  const spentToDateYen = [...dailyTotalsByDate.entries()].reduce((total, [date, value]) => {
    return date <= jstToday ? total + value : total;
  }, 0);
  const visibleDates = resolveVisibleDates(yearMonth, jstToday);

  const month = await monthRepository.findMonth(yearMonth);
  const budgetStatus = month?.budgetStatus ?? "unset";
  const budgetYen = month?.budgetYen ?? null;
  const hasBudget = budgetStatus === "set" && budgetYen != null;
  const remainingYen = hasBudget ? budgetYen - plannedTotalYen : 0;
  const overspentYen = remainingYen < 0 ? Math.abs(remainingYen) : 0;
  const recommendations = buildDailyRecommendations({
    remainingYen: hasBudget ? remainingYen : 0,
    dates: visibleDates
  });
  const recommendationMap = new Map(recommendations.map((row) => [row.date, row.recommendedYen]));
  const dailyRows: DailyRow[] = visibleDates.map((date) => ({
    date,
    label: date === jstToday ? "today" : "planned",
    usedYen: dailyTotalsByDate.get(date) ?? 0,
    recommendedYen: recommendationMap.get(date) ?? 0
  }));
  const todayRecommendedYen =
    dailyRows.find((row) => row.date === jstToday)?.recommendedYen ?? dailyRows[0]?.recommendedYen ?? 0;
  const daysRemaining = visibleDates.length;

  if (month) {
    return {
      yearMonth: month.yearMonth,
      monthStatus: "ready",
      budgetYen: month.budgetYen,
      budgetStatus: month.budgetStatus,
      initializedFromPreviousMonth: month.initializedFromPreviousMonth,
      carriedFromYearMonth: month.carriedFromYearMonth,
      suggestedInitialBudgetYen: null,
      spentToDateYen,
      plannedTotalYen,
      remainingYen,
      overspentYen,
      todayRecommendedYen,
      daysRemaining,
      dailyRows
    };
  }

  const previousBudget = await monthRepository.findPreviousMonthWithBudget(yearMonth);
  return {
    yearMonth,
    monthStatus: "uninitialized",
    budgetYen: null,
    budgetStatus: "unset",
    initializedFromPreviousMonth: false,
    carriedFromYearMonth: null,
    suggestedInitialBudgetYen: previousBudget?.budgetYen ?? null,
    spentToDateYen,
    plannedTotalYen,
    remainingYen,
    overspentYen,
    todayRecommendedYen,
    daysRemaining,
    dailyRows
  };
}

export async function initializeMonthExplicit(
  monthRepository: MonthRepository,
  input: InitializeMonthInput
): Promise<MonthRecord> {
  const existing = await monthRepository.findMonth(input.yearMonth);
  if (existing) {
    return existing;
  }

  const previousBudget = await monthRepository.findPreviousMonthWithBudget(input.yearMonth);
  const initializedFromPreviousMonth = previousBudget != null;
  const resolvedBudgetYen = input.budgetYen ?? previousBudget?.budgetYen ?? null;

  return monthRepository.createMonthIfAbsent({
    yearMonth: input.yearMonth,
    budgetYen: resolvedBudgetYen,
    budgetStatus: resolvedBudgetYen == null ? "unset" : "set",
    initializedFromPreviousMonth,
    carriedFromYearMonth: previousBudget?.yearMonth ?? null,
    nowIso: input.nowIso
  });
}

export async function upsertMonthBudget(
  monthRepository: MonthRepository,
  input: UpsertMonthBudgetInput
): Promise<MonthRecord> {
  const existing = await monthRepository.findMonth(input.yearMonth);
  if (!existing) {
    return initializeMonthExplicit(monthRepository, {
      yearMonth: input.yearMonth,
      budgetYen: input.budgetYen,
      nowIso: input.nowIso
    });
  }

  if (existing.budgetStatus === "set" && existing.budgetYen === input.budgetYen) {
    return existing;
  }

  return monthRepository.updateBudget(input.yearMonth, input.budgetYen, input.nowIso);
}

export function createDatabaseBackedMonthRepository(
  databaseClient: DatabaseClient<MonthRecord, DailyTotalRecord, DailyHistoryRecord>,
  transactionalMonthRepository: TransactionalMonthRepository
): MonthRepository {
  return {
    async findMonth(yearMonth) {
      return databaseClient.read((tx) => transactionalMonthRepository.findMonth(tx, yearMonth));
    },

    async findPreviousMonthWithBudget(yearMonth) {
      const previousYearMonth = toPreviousYearMonth(yearMonth);
      const month = await databaseClient.read((tx) =>
        transactionalMonthRepository.findMonth(tx, previousYearMonth)
      );
      if (!month || month.budgetStatus !== "set" || month.budgetYen == null) {
        return null;
      }

      const previous: PreviousMonthBudget = {
        yearMonth: month.yearMonth,
        budgetYen: month.budgetYen
      };
      return previous;
    },

    async createMonthIfAbsent(input) {
      return databaseClient.transaction((tx) => {
        return transactionalMonthRepository.createMonthIfAbsent(tx, input);
      });
    },

    async updateBudget(yearMonth, budgetYen, nowIso) {
      return databaseClient.transaction(async (tx) => {
        const existing = await transactionalMonthRepository.findMonth(tx, yearMonth);
        if (!existing) {
          throw new Error(`month not found: ${yearMonth}`);
        }

        const updated: MonthRecord = {
          ...existing,
          budgetYen,
          budgetStatus: "set",
          updatedAt: nowIso
        };
        tx.state.monthlyBudgets.set(yearMonth, updated);
        return { ...updated };
      });
    },

    async countMonths() {
      return databaseClient.read(async (tx) => tx.state.monthlyBudgets.size);
    }
  };
}

export type InMemoryApiServices = {
  monthRepository: MonthRepository;
  dayEntryService: DayEntryServicePort;
  listDailyTotalsByYearMonth: (yearMonth: string) => Promise<MonthSummaryDailyTotal[]>;
  listHistoryByDate: (date: string) => Promise<DailyHistoryRecord[]>;
  nowIso: () => string;
  jstToday: () => string;
};

export type InMemoryApiServicesWithInternals = InMemoryApiServices & {
  databaseClient: DatabaseClient<MonthRecord, DailyTotalRecord, DailyHistoryRecord>;
  transactionalMonthRepository: TransactionalMonthRepository;
  dailyTotalRepository: DailyTotalRepository;
  dailyHistoryRepository: DailyHistoryRepository;
};

export type CreateInMemoryApiServicesInput = {
  now?: () => Date;
  createHistoryId?: () => string;
};

export function createInMemoryApiServices(
  input: CreateInMemoryApiServicesInput = {}
): InMemoryApiServicesWithInternals {
  const now = input.now ?? (() => new Date());
  const databaseClient = createInMemoryDatabaseClient<
    MonthRecord,
    DailyTotalRecord,
    DailyHistoryRecord
  >();
  const transactionalMonthRepository = createTransactionalMonthRepository();
  const dailyTotalRepository = createDailyTotalRepository();
  const dailyHistoryRepository = createDailyHistoryRepository();
  const monthRepository = createDatabaseBackedMonthRepository(
    databaseClient,
    transactionalMonthRepository
  );

  const dayEntryService = new DayEntryService({
    databaseClient,
    monthRepository: transactionalMonthRepository,
    dailyTotalRepository,
    dailyHistoryRepository,
    now: () => now().toISOString(),
    createHistoryId: input.createHistoryId
  });

  return {
    databaseClient,
    monthRepository,
    transactionalMonthRepository,
    dailyTotalRepository,
    dailyHistoryRepository,
    dayEntryService,
    listDailyTotalsByYearMonth: async (yearMonth) => {
      return databaseClient.read(async (tx) => {
        return [...tx.state.dailyTotals.values()]
          .filter((row) => row.yearMonth === yearMonth)
          .map((row) => ({
            date: row.date,
            yearMonth: row.yearMonth,
            totalUsedYen: row.totalUsedYen
          }))
          .sort((left, right) => left.date.localeCompare(right.date));
      });
    },
    listHistoryByDate: async (date) => {
      return databaseClient.read((tx) => dailyHistoryRepository.listHistoriesByDate(tx, date));
    },
    nowIso: () => now().toISOString(),
    jstToday: () => getJstDateParts(now()).date
  };
}

type ApiServicesGlobalCache = {
  defaultInMemoryApiServices?: InMemoryApiServices;
  d1BindingScopedServices?: WeakMap<D1Database, InMemoryApiServices>;
  d1SchemaReadyByBinding?: WeakMap<D1Database, Promise<void>>;
};

const apiServicesCacheKey = Symbol.for("yosan-flow.api-services-cache");

function getApiServicesGlobalCache(): ApiServicesGlobalCache {
  const runtimeHost =
    (globalThis as { process?: unknown }).process ?? (globalThis as unknown);
  const cacheHost = runtimeHost as Record<string | symbol, unknown>;
  const existing = cacheHost[apiServicesCacheKey] as ApiServicesGlobalCache | undefined;
  if (existing) {
    return existing;
  }

  const created: ApiServicesGlobalCache = {};
  cacheHost[apiServicesCacheKey] = created;
  return created;
}

const d1SchemaStatements = [
  `CREATE TABLE IF NOT EXISTS monthly_budgets (
     year_month TEXT PRIMARY KEY,
     budget_yen INTEGER NULL,
     budget_status TEXT NOT NULL CHECK (budget_status IN ('unset', 'set')),
     initialized_from_previous_month INTEGER NOT NULL DEFAULT 0,
     carried_from_year_month TEXT NULL,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS daily_totals (
     date TEXT PRIMARY KEY,
     year_month TEXT NOT NULL,
     total_used_yen INTEGER NOT NULL CHECK (total_used_yen >= 0),
     updated_at TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_daily_totals_year_month
     ON daily_totals (year_month, date)`,
  `CREATE TABLE IF NOT EXISTS daily_operation_histories (
     id TEXT PRIMARY KEY,
     date TEXT NOT NULL,
     operation_type TEXT NOT NULL CHECK (operation_type IN ('add', 'overwrite')),
     input_yen INTEGER NOT NULL CHECK (input_yen >= 0),
     before_total_yen INTEGER NOT NULL CHECK (before_total_yen >= 0),
     after_total_yen INTEGER NOT NULL CHECK (after_total_yen >= 0),
     memo TEXT NULL,
     created_at TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_daily_histories_date_created_at
     ON daily_operation_histories (date, created_at DESC)`
];

async function ensureD1Schema(db: D1Database): Promise<void> {
  const cache = getApiServicesGlobalCache();
  cache.d1SchemaReadyByBinding ??= new WeakMap<D1Database, Promise<void>>();
  const existing = cache.d1SchemaReadyByBinding.get(db);
  if (existing) {
    await existing;
    return;
  }

  const initializePromise = db.batch(d1SchemaStatements.map((sql) => db.prepare(sql))).then(() => {});
  cache.d1SchemaReadyByBinding.set(db, initializePromise);

  try {
    await initializePromise;
  } catch (error) {
    cache.d1SchemaReadyByBinding.delete(db);
    throw error;
  }
}

export function getDefaultInMemoryApiServices(): InMemoryApiServices {
  const cache = getApiServicesGlobalCache();
  const existing = cache.defaultInMemoryApiServices;
  if (existing) {
    return existing;
  }

  const created = createInMemoryApiServices();
  cache.defaultInMemoryApiServices = created;
  return created;
}

function defaultCreateHistoryId(): string {
  const cryptoObject = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (cryptoObject?.randomUUID) {
    return cryptoObject.randomUUID();
  }
  return `history-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function toMonthRecord(row: {
  year_month: string;
  budget_yen: number | null;
  budget_status: "unset" | "set";
  initialized_from_previous_month: number;
  carried_from_year_month: string | null;
  created_at: string;
  updated_at: string;
}): MonthRecord {
  return {
    yearMonth: row.year_month,
    budgetYen: row.budget_yen,
    budgetStatus: row.budget_status,
    initializedFromPreviousMonth: row.initialized_from_previous_month === 1,
    carriedFromYearMonth: row.carried_from_year_month,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function createD1MonthRepository(db: D1Database): MonthRepository {
  return {
    async findMonth(yearMonth) {
      await ensureD1Schema(db);
      const row = await db
        .prepare(
          `SELECT year_month, budget_yen, budget_status, initialized_from_previous_month, carried_from_year_month, created_at, updated_at
             FROM monthly_budgets
            WHERE year_month = ?`
        )
        .bind(yearMonth)
        .first<{
          year_month: string;
          budget_yen: number | null;
          budget_status: "unset" | "set";
          initialized_from_previous_month: number;
          carried_from_year_month: string | null;
          created_at: string;
          updated_at: string;
        }>();
      return row ? toMonthRecord(row) : null;
    },

    async findPreviousMonthWithBudget(yearMonth) {
      await ensureD1Schema(db);
      const previousYearMonth = toPreviousYearMonth(yearMonth);
      const row = await db
        .prepare(
          `SELECT year_month, budget_yen
             FROM monthly_budgets
            WHERE year_month = ?
              AND budget_status = 'set'
              AND budget_yen IS NOT NULL
            LIMIT 1`
        )
        .bind(previousYearMonth)
        .first<{ year_month: string; budget_yen: number }>();
      if (!row) {
        return null;
      }
      return {
        yearMonth: row.year_month,
        budgetYen: row.budget_yen
      };
    },

    async createMonthIfAbsent(input) {
      await ensureD1Schema(db);
      await db
        .prepare(
          `INSERT INTO monthly_budgets (
             year_month, budget_yen, budget_status, initialized_from_previous_month, carried_from_year_month, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(year_month) DO NOTHING`
        )
        .bind(
          input.yearMonth,
          input.budgetYen,
          input.budgetStatus,
          input.initializedFromPreviousMonth ? 1 : 0,
          input.carriedFromYearMonth,
          input.nowIso,
          input.nowIso
        )
        .run();

      const month = await this.findMonth(input.yearMonth);
      if (!month) {
        throw new Error(`month not found after create: ${input.yearMonth}`);
      }
      return month;
    },

    async updateBudget(yearMonth, budgetYen, nowIso) {
      await ensureD1Schema(db);
      await db
        .prepare(
          `UPDATE monthly_budgets
              SET budget_yen = ?,
                  budget_status = 'set',
                  updated_at = ?
            WHERE year_month = ?`
        )
        .bind(budgetYen, nowIso, yearMonth)
        .run();
      const month = await this.findMonth(yearMonth);
      if (!month) {
        throw new Error(`month not found: ${yearMonth}`);
      }
      return month;
    },

    async countMonths() {
      await ensureD1Schema(db);
      const row = await db.prepare(`SELECT COUNT(*) AS count FROM monthly_budgets`).first<{ count: number }>();
      return Number(row?.count ?? 0);
    }
  };
}

function createD1DayEntryService(
  db: D1Database,
  monthRepository: MonthRepository,
  now: () => Date,
  createHistoryId: () => string
): DayEntryServicePort {
  async function execute(command: { date: string; inputYen: number; memo?: string | null }, operationType: "add" | "overwrite") {
    assertValidDate(command.date);
    assertValidInputYen(command.inputYen);
    await ensureD1Schema(db);

    const yearMonth = toYearMonth(command.date);
    const month = await monthRepository.findMonth(yearMonth);
    if (!month || month.budgetStatus !== "set" || month.budgetYen == null) {
      throw new BudgetNotSetError(yearMonth);
    }

    const nowIso = now().toISOString();
    const memo = normalizeMemo(command.memo);
    const existing = await db
      .prepare(`SELECT total_used_yen FROM daily_totals WHERE date = ?`)
      .bind(command.date)
      .first<{ total_used_yen: number }>();
    const beforeTotalYen = existing?.total_used_yen ?? 0;
    const afterTotalYen =
      operationType === "add" ? beforeTotalYen + command.inputYen : command.inputYen;

    await db.batch([
      db
        .prepare(
          `INSERT INTO daily_totals (date, year_month, total_used_yen, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(date) DO UPDATE SET
             year_month = excluded.year_month,
             total_used_yen = excluded.total_used_yen,
             updated_at = excluded.updated_at`
        )
        .bind(command.date, yearMonth, afterTotalYen, nowIso),
      db
        .prepare(
          `INSERT INTO daily_operation_histories (
             id, date, operation_type, input_yen, before_total_yen, after_total_yen, memo, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          createHistoryId(),
          command.date,
          operationType,
          command.inputYen,
          beforeTotalYen,
          afterTotalYen,
          memo,
          nowIso
        )
    ]);
  }

  return {
    async addDailyAmount(command) {
      await execute(command, "add");
      return {};
    },
    async overwriteDailyAmount(command) {
      await execute(command, "overwrite");
      return {};
    }
  };
}

export function createD1ApiServices(
  db: D1Database,
  input: CreateInMemoryApiServicesInput = {}
): InMemoryApiServices {
  const now = input.now ?? (() => new Date());
  const monthRepository = createD1MonthRepository(db);
  const dayEntryService = createD1DayEntryService(
    db,
    monthRepository,
    now,
    input.createHistoryId ?? defaultCreateHistoryId
  );

  return {
    monthRepository,
    dayEntryService,
    listDailyTotalsByYearMonth: async (yearMonth) => {
      await ensureD1Schema(db);
      const result = await db
        .prepare(
          `SELECT date, year_month, total_used_yen
             FROM daily_totals
            WHERE year_month = ?
            ORDER BY date ASC`
        )
        .bind(yearMonth)
        .all<{ date: string; year_month: string; total_used_yen: number }>();
      const rows = result.results ?? [];
      return rows.map((row: { date: string; year_month: string; total_used_yen: number }) => ({
        date: row.date,
        yearMonth: row.year_month,
        totalUsedYen: row.total_used_yen
      }));
    },
    listHistoryByDate: async (date) => {
      await ensureD1Schema(db);
      const result = await db
        .prepare(
          `SELECT id, date, operation_type, input_yen, before_total_yen, after_total_yen, memo, created_at
             FROM daily_operation_histories
            WHERE date = ?
            ORDER BY created_at DESC, id DESC`
        )
        .bind(date)
        .all<{
          id: string;
          date: string;
          operation_type: "add" | "overwrite";
          input_yen: number;
          before_total_yen: number;
          after_total_yen: number;
          memo: string | null;
          created_at: string;
        }>();
      const rows = result.results ?? [];
      return rows.map((row: {
        id: string;
        date: string;
        operation_type: "add" | "overwrite";
        input_yen: number;
        before_total_yen: number;
        after_total_yen: number;
        memo: string | null;
        created_at: string;
      }) => ({
        id: row.id,
        date: row.date,
        operationType: row.operation_type,
        inputYen: row.input_yen,
        beforeTotalYen: row.before_total_yen,
        afterTotalYen: row.after_total_yen,
        memo: row.memo,
        createdAt: row.created_at
      }));
    },
    nowIso: () => now().toISOString(),
    jstToday: () => getJstDateParts(now()).date
  };
}

export function getApiServicesFromPlatform(platform?: App.Platform): InMemoryApiServices {
  const runtimeProcess = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  if (runtimeProcess?.env?.YOSAN_FLOW_FORCE_IN_MEMORY_DEV === "1") {
    return getDefaultInMemoryApiServices();
  }

  const db = platform?.env?.DB;
  if (!db) {
    return getDefaultInMemoryApiServices();
  }

  const cache = getApiServicesGlobalCache();
  const d1BindingScopedServices =
    cache.d1BindingScopedServices ?? (cache.d1BindingScopedServices = new WeakMap());
  const existing = d1BindingScopedServices.get(db);
  if (existing) {
    return existing;
  }

  const created = createD1ApiServices(db);
  d1BindingScopedServices.set(db, created);
  return created;
}
