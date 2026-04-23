import { createInMemoryDatabaseClient, type DatabaseClient } from "$lib/server/db/client";
import type { D1Database } from "$lib/server/db/d1-types";
import {
  createD1BudgetPeriodRepository,
  createInMemoryBudgetPeriodRepository,
  PeriodValidationError,
  type BudgetPeriodRecord,
  type BudgetPeriodRepository
} from "$lib/server/db/budget-period-repository";
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
import { assertValidDate, assertValidInputYen, normalizeMemo } from "$lib/server/domain/daily-entry";
import { isDateWithinPeriod } from "$lib/server/domain/budget-period";
import { buildDailyRecommendations } from "$lib/server/domain/reallocation";
import { DayEntryService } from "$lib/server/services/day-entry-service";
import { getJstDateParts } from "$lib/server/time/jst";

export class PeriodNotFoundError extends Error {
  readonly code = "PERIOD_NOT_FOUND";

  constructor(periodId: string) {
    super(`Period not found: ${periodId}`);
    this.name = "PeriodNotFoundError";
  }
}

export class DateOutOfPeriodError extends Error {
  readonly code = "DATE_OUT_OF_PERIOD";

  constructor(date: string, periodId: string) {
    super(`Date ${date} is outside period ${periodId}`);
    this.name = "DateOutOfPeriodError";
  }
}

export type PeriodDailyRow = {
  date: string;
  label: "today" | "planned";
  usedYen: number;
  recommendedYen: number;
};

export type PeriodSummaryDailyTotal = {
  date: string;
  budgetPeriodId: string;
  totalUsedYen: number;
};

export type PeriodSummary = {
  periodId: string;
  startDate: string;
  endDate: string;
  budgetYen: number;
  status: "active" | "closed";
  periodLengthDays: number;
  spentToDateYen: number;
  plannedTotalYen: number;
  remainingYen: number;
  overspentYen: number;
  todayRecommendedYen: number;
  varianceFromRecommendationYen: number;
  remainingAfterDayYenPreview: number;
  daysRemaining: number;
  dailyRows: PeriodDailyRow[];
};

export type DayEntryServicePort = {
  addDailyAmount(command: {
    periodId: string;
    date: string;
    inputYen: number;
    memo?: string | null;
  }): Promise<unknown>;
  overwriteDailyAmount(command: {
    periodId: string;
    date: string;
    inputYen: number;
    memo?: string | null;
  }): Promise<unknown>;
};

export type BuildPeriodSummaryOptions = {
  jstToday?: string;
  dailyTotals?: PeriodSummaryDailyTotal[];
};

function toDateValue(date: string): number {
  return Date.parse(`${date}T00:00:00.000Z`);
}

function nextDate(date: string): string {
  return new Date(toDateValue(date) + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function buildDateRange(startDate: string, endDate: string): string[] {
  if (startDate > endDate) {
    return [];
  }

  const rows: string[] = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    rows.push(cursor);
    cursor = nextDate(cursor);
  }
  return rows;
}

function buildDailyTotalMap(
  periodId: string,
  startDate: string,
  endDate: string,
  dailyTotals: PeriodSummaryDailyTotal[]
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of dailyTotals) {
    if (row.budgetPeriodId !== periodId) {
      continue;
    }
    if (!isDateWithinPeriod(row.date, startDate, endDate)) {
      continue;
    }
    map.set(row.date, (map.get(row.date) ?? 0) + row.totalUsedYen);
  }
  return map;
}

function resolveDaysRemaining(startDate: string, endDate: string, jstToday: string): number {
  if (jstToday < startDate) {
    return buildDateRange(startDate, endDate).length;
  }
  if (jstToday > endDate) {
    return 0;
  }
  return buildDateRange(jstToday, endDate).length;
}

export async function buildPeriodSummary(
  budgetPeriodRepository: BudgetPeriodRepository,
  periodId: string,
  options: BuildPeriodSummaryOptions = {}
): Promise<PeriodSummary> {
  const period = await budgetPeriodRepository.findById(periodId);
  if (!period) {
    throw new PeriodNotFoundError(periodId);
  }

  const jstToday = options.jstToday ?? getJstDateParts(new Date()).date;
  const dailyTotals = options.dailyTotals ?? [];
  const dailyTotalsByDate = buildDailyTotalMap(period.id, period.startDate, period.endDate, dailyTotals);
  const periodDates = buildDateRange(period.startDate, period.endDate);
  const periodLengthDays = periodDates.length;
  const plannedTotalYen = [...dailyTotalsByDate.values()].reduce((total, current) => total + current, 0);
  const spentToDateYen = [...dailyTotalsByDate.entries()].reduce((total, [date, value]) => {
    return date <= jstToday ? total + value : total;
  }, 0);
  const spentBeforeTodayYen = [...dailyTotalsByDate.entries()].reduce((total, [date, value]) => {
    return date < jstToday ? total + value : total;
  }, 0);
  const usedTodayYen = dailyTotalsByDate.get(jstToday) ?? 0;
  const remainingAtTodayYen = period.budgetYen - spentBeforeTodayYen;
  const remainingDates =
    jstToday < period.startDate
      ? periodDates
      : jstToday > period.endDate
        ? []
        : buildDateRange(jstToday, period.endDate);

  const remainingYen = period.budgetYen - plannedTotalYen;
  const overspentYen = remainingYen < 0 ? Math.abs(remainingYen) : 0;
  const recommendations = buildDailyRecommendations({
    remainingYen: remainingAtTodayYen,
    dates: remainingDates
  });
  const recommendationMap = new Map(recommendations.map((row) => [row.date, row.recommendedYen]));
  const dailyRows: PeriodDailyRow[] = periodDates.map((date) => ({
    date,
    label: date === jstToday ? "today" : "planned",
    usedYen: dailyTotalsByDate.get(date) ?? 0,
    recommendedYen: recommendationMap.get(date) ?? 0
  }));
  const todayRecommendedYen = recommendationMap.get(jstToday) ?? 0;
  const varianceFromRecommendationYen = usedTodayYen - todayRecommendedYen;
  const remainingAfterDayYenPreview = remainingAtTodayYen - usedTodayYen;
  const daysRemaining = resolveDaysRemaining(period.startDate, period.endDate, jstToday);

  return {
    periodId: period.id,
    startDate: period.startDate,
    endDate: period.endDate,
    budgetYen: period.budgetYen,
    status: period.status,
    periodLengthDays,
    spentToDateYen,
    plannedTotalYen,
    remainingYen,
    overspentYen,
    todayRecommendedYen,
    varianceFromRecommendationYen,
    remainingAfterDayYenPreview,
    daysRemaining,
    dailyRows
  };
}

export type InMemoryApiServices = {
  budgetPeriodRepository: BudgetPeriodRepository;
  dayEntryService: DayEntryServicePort;
  createPeriod: (input: {
    id: string;
    startDate: string;
    endDate: string;
    budgetYen: number;
    predecessorPeriodId?: string | null;
  }) => Promise<BudgetPeriodRecord>;
  updatePeriod: (input: {
    id: string;
    startDate: string;
    endDate: string;
    budgetYen: number;
  }) => Promise<BudgetPeriodRecord>;
  listPeriods: () => Promise<BudgetPeriodRecord[]>;
  listDailyTotalsByPeriodId: (periodId: string) => Promise<PeriodSummaryDailyTotal[]>;
  listHistoryByDate: (periodId: string, date: string) => Promise<DailyHistoryRecord[]>;
  nowIso: () => string;
  jstToday: () => string;
};

export type InMemoryApiServicesWithInternals = InMemoryApiServices & {
  databaseClient: DatabaseClient<BudgetPeriodRecord, DailyTotalRecord, DailyHistoryRecord>;
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
    BudgetPeriodRecord,
    DailyTotalRecord,
    DailyHistoryRecord
  >();
  const dailyTotalRepository = createDailyTotalRepository();
  const dailyHistoryRepository = createDailyHistoryRepository();
  const budgetPeriodRepository = createInMemoryBudgetPeriodRepository();

  let mutationQueue: Promise<void> = Promise.resolve();
  async function runSerialized<T>(work: () => Promise<T>): Promise<T> {
    const pending = mutationQueue;
    let releaseQueue: (() => void) | undefined;
    mutationQueue = new Promise<void>((resolve) => {
      releaseQueue = resolve;
    });
    await pending;
    try {
      return await work();
    } finally {
      releaseQueue?.();
    }
  }

  const rawDayEntryService = new DayEntryService({
    databaseClient,
    budgetPeriodRepository,
    dailyTotalRepository,
    dailyHistoryRepository,
    now: () => now().toISOString(),
    createHistoryId: input.createHistoryId
  });

  async function assertNoOutOfRangePeriodEntries(
    periodId: string,
    startDate: string,
    endDate: string
  ): Promise<void> {
    const hasOutOfRangeEntries = await databaseClient.read(async (tx) => {
      const hasOutOfRangeTotal = [...tx.state.dailyTotals.values()].some(
        (row) =>
          row.budgetPeriodId === periodId &&
          !isDateWithinPeriod(row.date, startDate, endDate)
      );
      if (hasOutOfRangeTotal) {
        return true;
      }
      return tx.state.dailyOperationHistories.some(
        (row) =>
          row.budgetPeriodId === periodId &&
          !isDateWithinPeriod(row.date, startDate, endDate)
      );
    });

    if (hasOutOfRangeEntries) {
      throw new PeriodValidationError(
        "PERIOD_HAS_OUT_OF_RANGE_ENTRIES",
        `period ${periodId} has entries outside the updated range`
      );
    }
  }

  return {
    databaseClient,
    budgetPeriodRepository,
    dailyTotalRepository,
    dailyHistoryRepository,
    dayEntryService: {
      addDailyAmount: (command) => runSerialized(() => rawDayEntryService.addDailyAmount(command)),
      overwriteDailyAmount: (command) =>
        runSerialized(() => rawDayEntryService.overwriteDailyAmount(command))
    },
    createPeriod: async (periodInput) =>
      runSerialized(() =>
        budgetPeriodRepository.createPeriod({
          ...periodInput,
          nowIso: now().toISOString()
        })
      ),
    updatePeriod: async (periodInput) => {
      return runSerialized(async () => {
        await assertNoOutOfRangePeriodEntries(
          periodInput.id,
          periodInput.startDate,
          periodInput.endDate
        );
        return budgetPeriodRepository.updatePeriod({
          ...periodInput,
          nowIso: now().toISOString()
        });
      });
    },
    listPeriods: () => budgetPeriodRepository.listPeriods(),
    listDailyTotalsByPeriodId: async (periodId) => {
      return databaseClient.read(async (tx) => {
        return [...tx.state.dailyTotals.values()]
          .filter((row) => row.budgetPeriodId === periodId)
          .map((row) => ({
            date: row.date,
            budgetPeriodId: row.budgetPeriodId,
            totalUsedYen: row.totalUsedYen
          }))
          .sort((left, right) => left.date.localeCompare(right.date));
      });
    },
    listHistoryByDate: async (periodId, date) => {
      const period = await budgetPeriodRepository.findById(periodId);
      if (!period) {
        throw new PeriodNotFoundError(periodId);
      }
      return databaseClient.read((tx) => dailyHistoryRepository.listHistoriesByDate(tx, date, periodId));
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
  `CREATE TABLE IF NOT EXISTS budget_periods (
     id TEXT PRIMARY KEY,
     start_date TEXT NOT NULL,
     end_date TEXT NOT NULL,
     budget_yen INTEGER NOT NULL CHECK (budget_yen >= 0),
     status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
     predecessor_period_id TEXT NULL REFERENCES budget_periods (id),
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL,
     CHECK (start_date <= end_date)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_budget_periods_start_end
     ON budget_periods (start_date, end_date)`,
  `CREATE TABLE IF NOT EXISTS daily_totals (
     budget_period_id TEXT NOT NULL REFERENCES budget_periods (id),
     date TEXT NOT NULL,
     year_month TEXT NOT NULL,
     total_used_yen INTEGER NOT NULL CHECK (total_used_yen >= 0),
     updated_at TEXT NOT NULL,
     PRIMARY KEY (budget_period_id, date)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_daily_totals_period_date
     ON daily_totals (budget_period_id, date)`,
  `CREATE TABLE IF NOT EXISTS daily_operation_histories (
     id TEXT PRIMARY KEY,
     budget_period_id TEXT NOT NULL REFERENCES budget_periods (id),
     date TEXT NOT NULL,
     operation_type TEXT NOT NULL CHECK (operation_type IN ('add', 'overwrite')),
     input_yen INTEGER NOT NULL CHECK (input_yen >= 0),
     before_total_yen INTEGER NOT NULL CHECK (before_total_yen >= 0),
     after_total_yen INTEGER NOT NULL CHECK (after_total_yen >= 0),
     memo TEXT NULL,
     created_at TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_daily_histories_period_date_created_at
     ON daily_operation_histories (budget_period_id, date, created_at DESC)`,
  `CREATE TRIGGER IF NOT EXISTS budget_periods_no_overlap_insert
     BEFORE INSERT ON budget_periods
     FOR EACH ROW
     BEGIN
       SELECT CASE
         WHEN EXISTS (
           SELECT 1
             FROM budget_periods
            WHERE start_date <= NEW.end_date
              AND end_date >= NEW.start_date
         ) THEN RAISE(ABORT, 'PERIOD_OVERLAP')
       END;
     END`,
  `CREATE TRIGGER IF NOT EXISTS budget_periods_no_overlap_update
     BEFORE UPDATE ON budget_periods
     FOR EACH ROW
     BEGIN
       SELECT CASE
         WHEN EXISTS (
           SELECT 1
             FROM budget_periods
            WHERE id <> NEW.id
              AND start_date <= NEW.end_date
              AND end_date >= NEW.start_date
         ) THEN RAISE(ABORT, 'PERIOD_OVERLAP')
       END;
     END`,
  `CREATE TRIGGER IF NOT EXISTS budget_periods_predecessor_insert
     BEFORE INSERT ON budget_periods
     FOR EACH ROW
     WHEN NEW.predecessor_period_id IS NOT NULL
     BEGIN
       SELECT CASE
         WHEN NOT EXISTS (
           SELECT 1
             FROM budget_periods
            WHERE id = NEW.predecessor_period_id
              AND date(end_date, '+1 day') = NEW.start_date
         ) THEN RAISE(ABORT, 'PERIOD_CONTINUITY_VIOLATION')
       END;
     END`,
  `CREATE TRIGGER IF NOT EXISTS budget_periods_predecessor_update
     BEFORE UPDATE ON budget_periods
     FOR EACH ROW
     WHEN NEW.predecessor_period_id IS NOT NULL
     BEGIN
       SELECT CASE
         WHEN NOT EXISTS (
           SELECT 1
             FROM budget_periods
            WHERE id = NEW.predecessor_period_id
              AND date(end_date, '+1 day') = NEW.start_date
         ) THEN RAISE(ABORT, 'PERIOD_CONTINUITY_VIOLATION')
       END;
     END`,
  `CREATE TRIGGER IF NOT EXISTS budget_periods_successor_update
     BEFORE UPDATE ON budget_periods
     FOR EACH ROW
     BEGIN
       SELECT CASE
         WHEN EXISTS (
           SELECT 1
             FROM budget_periods
            WHERE predecessor_period_id = NEW.id
              AND start_date <> date(NEW.end_date, '+1 day')
         ) THEN RAISE(ABORT, 'PERIOD_CONTINUITY_VIOLATION')
       END;
     END`,
  `CREATE TRIGGER IF NOT EXISTS budget_periods_update_range_guard
     BEFORE UPDATE ON budget_periods
     FOR EACH ROW
     BEGIN
       SELECT CASE
         WHEN EXISTS (
           SELECT 1
             FROM daily_totals
            WHERE budget_period_id = NEW.id
              AND (date < NEW.start_date OR date > NEW.end_date)
         ) THEN RAISE(ABORT, 'PERIOD_HAS_OUT_OF_RANGE_ENTRIES')
       END;
       SELECT CASE
         WHEN EXISTS (
           SELECT 1
             FROM daily_operation_histories
            WHERE budget_period_id = NEW.id
              AND (date < NEW.start_date OR date > NEW.end_date)
         ) THEN RAISE(ABORT, 'PERIOD_HAS_OUT_OF_RANGE_ENTRIES')
       END;
     END`,
  `CREATE TRIGGER IF NOT EXISTS daily_totals_date_in_period_insert
     BEFORE INSERT ON daily_totals
     FOR EACH ROW
     BEGIN
       SELECT CASE
         WHEN NOT EXISTS (
           SELECT 1
             FROM budget_periods
            WHERE id = NEW.budget_period_id
              AND NEW.date >= start_date
              AND NEW.date <= end_date
         ) THEN RAISE(ABORT, 'DATE_OUT_OF_PERIOD')
       END;
     END`,
  `CREATE TRIGGER IF NOT EXISTS daily_totals_date_in_period_update
     BEFORE UPDATE ON daily_totals
     FOR EACH ROW
     BEGIN
       SELECT CASE
         WHEN NOT EXISTS (
           SELECT 1
             FROM budget_periods
            WHERE id = NEW.budget_period_id
              AND NEW.date >= start_date
              AND NEW.date <= end_date
         ) THEN RAISE(ABORT, 'DATE_OUT_OF_PERIOD')
       END;
     END`,
  `CREATE TRIGGER IF NOT EXISTS daily_histories_date_in_period_insert
     BEFORE INSERT ON daily_operation_histories
     FOR EACH ROW
     BEGIN
       SELECT CASE
         WHEN NOT EXISTS (
           SELECT 1
             FROM budget_periods
            WHERE id = NEW.budget_period_id
              AND NEW.date >= start_date
              AND NEW.date <= end_date
         ) THEN RAISE(ABORT, 'DATE_OUT_OF_PERIOD')
       END;
     END`
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

function toPeriodRow(row: {
  id: string;
  start_date: string;
  end_date: string;
  budget_yen: number;
  status: "active" | "closed";
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

function createD1DayEntryService(
  db: D1Database,
  now: () => Date,
  createHistoryId: () => string
): DayEntryServicePort {
  async function execute(
    command: { periodId: string; date: string; inputYen: number; memo?: string | null },
    operationType: "add" | "overwrite"
  ) {
    assertValidDate(command.date);
    assertValidInputYen(command.inputYen);
    await ensureD1Schema(db);

    const period = await db
      .prepare(
        `SELECT id, start_date, end_date, budget_yen, status, predecessor_period_id, created_at, updated_at
           FROM budget_periods
          WHERE id = ?`
      )
      .bind(command.periodId)
      .first<{
        id: string;
        start_date: string;
        end_date: string;
        budget_yen: number;
        status: "active" | "closed";
        predecessor_period_id: string | null;
        created_at: string;
        updated_at: string;
      }>();
    if (!period) {
      throw new PeriodNotFoundError(command.periodId);
    }
    if (!isDateWithinPeriod(command.date, period.start_date, period.end_date)) {
      throw new DateOutOfPeriodError(command.date, command.periodId);
    }

    const nowIso = now().toISOString();
    const memo = normalizeMemo(command.memo);

    const existing = await db
      .prepare(
        `SELECT total_used_yen
           FROM daily_totals
          WHERE budget_period_id = ?
            AND date = ?`
      )
      .bind(command.periodId, command.date)
      .first<{ total_used_yen: number }>();
    const beforeTotalYen = existing?.total_used_yen ?? 0;
    const afterTotalYen =
      operationType === "add" ? beforeTotalYen + command.inputYen : command.inputYen;
    const totalMutation =
      operationType === "add"
        ? db
            .prepare(
              `INSERT INTO daily_totals (budget_period_id, date, year_month, total_used_yen, updated_at)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(budget_period_id, date) DO UPDATE SET
                 year_month = excluded.year_month,
                 total_used_yen = daily_totals.total_used_yen + excluded.total_used_yen,
                 updated_at = excluded.updated_at`
            )
            .bind(command.periodId, command.date, command.date.slice(0, 7), command.inputYen, nowIso)
        : db
            .prepare(
              `INSERT INTO daily_totals (budget_period_id, date, year_month, total_used_yen, updated_at)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(budget_period_id, date) DO UPDATE SET
                 year_month = excluded.year_month,
                 total_used_yen = excluded.total_used_yen,
                 updated_at = excluded.updated_at`
            )
            .bind(command.periodId, command.date, command.date.slice(0, 7), command.inputYen, nowIso);
    const historyInsert = db
      .prepare(
        `INSERT INTO daily_operation_histories (
           id, budget_period_id, date, operation_type, input_yen, before_total_yen, after_total_yen, memo, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        createHistoryId(),
        command.periodId,
        command.date,
        operationType,
        command.inputYen,
        beforeTotalYen,
        afterTotalYen,
        memo,
        nowIso
      );

    await db.batch([totalMutation, historyInsert]);
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
  const budgetPeriodRepository = createD1BudgetPeriodRepository({
    db,
    ensureSchema: () => ensureD1Schema(db)
  });
  const dayEntryService = createD1DayEntryService(
    db,
    now,
    input.createHistoryId ?? defaultCreateHistoryId
  );

  async function assertNoOutOfRangePeriodEntries(
    periodId: string,
    startDate: string,
    endDate: string
  ): Promise<void> {
    await ensureD1Schema(db);
    const outOfRangeTotal = await db
      .prepare(
        `SELECT 1
           FROM daily_totals
          WHERE budget_period_id = ?
            AND (date < ? OR date > ?)
          LIMIT 1`
      )
      .bind(periodId, startDate, endDate)
      .first();
    const outOfRangeHistory = await db
      .prepare(
        `SELECT 1
           FROM daily_operation_histories
          WHERE budget_period_id = ?
            AND (date < ? OR date > ?)
          LIMIT 1`
      )
      .bind(periodId, startDate, endDate)
      .first();

    if (outOfRangeTotal || outOfRangeHistory) {
      throw new PeriodValidationError(
        "PERIOD_HAS_OUT_OF_RANGE_ENTRIES",
        `period ${periodId} has entries outside the updated range`
      );
    }
  }

  return {
    budgetPeriodRepository,
    dayEntryService,
    createPeriod: (periodInput) =>
      budgetPeriodRepository.createPeriod({
        ...periodInput,
        nowIso: now().toISOString()
      }),
    updatePeriod: async (periodInput) => {
      await assertNoOutOfRangePeriodEntries(
        periodInput.id,
        periodInput.startDate,
        periodInput.endDate
      );
      return budgetPeriodRepository.updatePeriod({
        ...periodInput,
        nowIso: now().toISOString()
      });
    },
    listPeriods: () => budgetPeriodRepository.listPeriods(),
    listDailyTotalsByPeriodId: async (periodId) => {
      await ensureD1Schema(db);
      const result = await db
        .prepare(
          `SELECT budget_period_id, date, total_used_yen
             FROM daily_totals
            WHERE budget_period_id = ?
            ORDER BY date ASC`
        )
        .bind(periodId)
        .all<{ budget_period_id: string; date: string; total_used_yen: number }>();
      const rows = result.results ?? [];
      return rows.map((row) => ({
        date: row.date,
        budgetPeriodId: row.budget_period_id,
        totalUsedYen: row.total_used_yen
      }));
    },
    listHistoryByDate: async (periodId, date) => {
      await ensureD1Schema(db);
      const period = await budgetPeriodRepository.findById(periodId);
      if (!period) {
        throw new PeriodNotFoundError(periodId);
      }
      const result = await db
        .prepare(
          `SELECT id, budget_period_id, date, operation_type, input_yen, before_total_yen, after_total_yen, memo, created_at
             FROM daily_operation_histories
            WHERE budget_period_id = ?
              AND date = ?
            ORDER BY created_at DESC, id DESC`
        )
        .bind(periodId, date)
        .all<{
          id: string;
          budget_period_id: string;
          date: string;
          operation_type: "add" | "overwrite";
          input_yen: number;
          before_total_yen: number;
          after_total_yen: number;
          memo: string | null;
          created_at: string;
        }>();
      const rows = result.results ?? [];
      return rows.map((row) => ({
        id: row.id,
        budgetPeriodId: row.budget_period_id,
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
    if (platform) {
      throw new Error("D1 binding DB is required");
    }
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

export async function getPeriodSummaryFromServices(
  services: InMemoryApiServices,
  periodId: string
): Promise<PeriodSummary> {
  return buildPeriodSummary(services.budgetPeriodRepository, periodId, {
    jstToday: services.jstToday(),
    dailyTotals: await services.listDailyTotalsByPeriodId(periodId)
  });
}
