import {
  createInMemoryDatabaseClient,
  type DatabaseClient,
} from "$lib/server/db/client";
import type { D1Database } from "$lib/server/db/d1-types";
import {
  createD1BudgetPeriodRepository,
  createInMemoryBudgetPeriodRepository,
  PeriodValidationError,
  type BudgetPeriodRecord,
  type BudgetPeriodRepository,
} from "$lib/server/db/budget-period-repository";
import {
  createD1DailyHistoryRepository,
  createDailyHistoryRepository,
  type D1DailyHistoryRepository,
  type DailyHistoryRecord,
  type DailyHistoryRepository,
} from "$lib/server/db/daily-history-repository";
import {
  createD1DailyTotalRepository,
  createDailyTotalRepository,
  type D1DailyTotalRepository,
  type DailyTotalRecord,
  type DailyTotalRepository,
} from "$lib/server/db/daily-total-repository";
import {
  assertValidDate,
  assertValidInputYen,
  normalizeMemo,
} from "$lib/server/domain/daily-entry";
import { isDateWithinPeriod } from "$lib/server/domain/budget-period";
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

export type FoodPaceStatus = "bonus" | "adjustment" | "on_track";

export type FoodPaceSummary = {
  status: FoodPaceStatus;
  baseDailyYen: number;
  todayAllowanceYen: number;
  usedTodayYen: number;
  todayRemainingYen: number;
  todayBonusYen: number;
  adjustmentYen: number;
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
  foodPace: FoodPaceSummary;
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
  return new Date(toDateValue(date) + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
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
  dailyTotals: PeriodSummaryDailyTotal[],
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

function resolveDaysRemaining(
  startDate: string,
  endDate: string,
  jstToday: string,
): number {
  if (jstToday < startDate) {
    return buildDateRange(startDate, endDate).length;
  }
  if (jstToday > endDate) {
    return 0;
  }
  return buildDateRange(jstToday, endDate).length;
}

function buildFoodPaceSummary(input: {
  budgetYen: number;
  periodLengthDays: number;
  spentBeforeTodayYen: number;
  usedTodayYen: number;
  remainingDates: string[];
}): FoodPaceSummary {
  const baseDailyYen =
    input.periodLengthDays === 0
      ? 0
      : Math.floor(input.budgetYen / input.periodLengthDays);
  const daysFromToday = input.remainingDates.length;
  if (daysFromToday === 0) {
    return {
      status: "on_track",
      baseDailyYen,
      todayAllowanceYen: 0,
      usedTodayYen: input.usedTodayYen,
      todayRemainingYen: input.usedTodayYen === 0 ? 0 : -input.usedTodayYen,
      todayBonusYen: 0,
      adjustmentYen: 0,
    };
  }

  const remainingAtTodayStartYen = input.budgetYen - input.spentBeforeTodayYen;
  const expectedRemainingAtBasePaceYen = baseDailyYen * daysFromToday;
  const paceDeltaYen =
    remainingAtTodayStartYen - expectedRemainingAtBasePaceYen;
  const todayBonusYen = paceDeltaYen > 0 ? paceDeltaYen : 0;
  const shortageYen = paceDeltaYen < 0 ? Math.abs(paceDeltaYen) : 0;
  const adjustmentBaseYen =
    shortageYen > 0 ? Math.floor(shortageYen / daysFromToday) : 0;
  const adjustmentRemainderYen = shortageYen % daysFromToday;
  const adjustmentYen =
    adjustmentBaseYen + (adjustmentRemainderYen > 0 ? 1 : 0);
  const todayAllowanceYen = Math.max(
    0,
    baseDailyYen + todayBonusYen - adjustmentYen,
  );

  return {
    status:
      todayBonusYen > 0
        ? "bonus"
        : adjustmentYen > 0
          ? "adjustment"
          : "on_track",
    baseDailyYen,
    todayAllowanceYen,
    usedTodayYen: input.usedTodayYen,
    todayRemainingYen: todayAllowanceYen - input.usedTodayYen,
    todayBonusYen,
    adjustmentYen,
  };
}

function buildFoodPaceRecommendations(input: {
  foodPace: FoodPaceSummary;
  remainingAtTodayYen: number;
  remainingDates: string[];
}): Array<{ date: string; recommendedYen: number }> {
  const expectedRemainingAtBasePaceYen =
    input.foodPace.baseDailyYen * input.remainingDates.length;
  const surplusYen = Math.max(
    0,
    input.remainingAtTodayYen - expectedRemainingAtBasePaceYen,
  );
  const shortageYen = Math.max(
    0,
    expectedRemainingAtBasePaceYen - input.remainingAtTodayYen,
  );
  const surplusBaseYen =
    input.remainingDates.length === 0
      ? 0
      : Math.floor(surplusYen / input.remainingDates.length);
  const surplusRemainderYen =
    input.remainingDates.length === 0
      ? 0
      : surplusYen % input.remainingDates.length;
  const adjustmentBaseYen =
    input.remainingDates.length === 0
      ? 0
      : Math.floor(shortageYen / input.remainingDates.length);
  const adjustmentRemainderYen =
    input.remainingDates.length === 0
      ? 0
      : shortageYen % input.remainingDates.length;

  return input.remainingDates.map((date, index) => {
    if (input.foodPace.todayBonusYen > 0) {
      return {
        date,
        recommendedYen:
          index === 0
            ? input.foodPace.todayAllowanceYen
            : input.foodPace.baseDailyYen,
      };
    }

    if (surplusYen > 0) {
      const extraYen = surplusBaseYen + (index < surplusRemainderYen ? 1 : 0);
      return {
        date,
        recommendedYen: input.foodPace.baseDailyYen + extraYen,
      };
    }

    const adjustmentYen =
      adjustmentBaseYen + (index < adjustmentRemainderYen ? 1 : 0);
    return {
      date,
      recommendedYen: Math.max(0, input.foodPace.baseDailyYen - adjustmentYen),
    };
  });
}

export async function buildPeriodSummary(
  budgetPeriodRepository: BudgetPeriodRepository,
  periodId: string,
  options: BuildPeriodSummaryOptions = {},
): Promise<PeriodSummary> {
  const period = await budgetPeriodRepository.findById(periodId);
  if (!period) {
    throw new PeriodNotFoundError(periodId);
  }

  const jstToday = options.jstToday ?? getJstDateParts(new Date()).date;
  const dailyTotals = options.dailyTotals ?? [];
  const dailyTotalsByDate = buildDailyTotalMap(
    period.id,
    period.startDate,
    period.endDate,
    dailyTotals,
  );
  const periodDates = buildDateRange(period.startDate, period.endDate);
  const periodLengthDays = periodDates.length;
  const plannedTotalYen = [...dailyTotalsByDate.values()].reduce(
    (total, current) => total + current,
    0,
  );
  const spentToDateYen = [...dailyTotalsByDate.entries()].reduce(
    (total, [date, value]) => {
      return date <= jstToday ? total + value : total;
    },
    0,
  );
  const spentBeforeTodayYen = [...dailyTotalsByDate.entries()].reduce(
    (total, [date, value]) => {
      return date < jstToday ? total + value : total;
    },
    0,
  );
  const usedTodayYen = dailyTotalsByDate.get(jstToday) ?? 0;
  const remainingAtTodayYen = period.budgetYen - spentBeforeTodayYen;
  const isTodayWithinPeriod = isDateWithinPeriod(
    jstToday,
    period.startDate,
    period.endDate,
  );
  const remainingDates =
    jstToday < period.startDate
      ? periodDates
      : jstToday > period.endDate
        ? []
        : buildDateRange(jstToday, period.endDate);
  const paceDates = isTodayWithinPeriod ? remainingDates : [];

  const remainingYen = period.budgetYen - plannedTotalYen;
  const overspentYen = remainingYen < 0 ? Math.abs(remainingYen) : 0;
  const foodPace = buildFoodPaceSummary({
    budgetYen: period.budgetYen,
    periodLengthDays,
    spentBeforeTodayYen,
    usedTodayYen,
    remainingDates: paceDates,
  });
  const recommendations = buildFoodPaceRecommendations({
    foodPace,
    remainingAtTodayYen,
    remainingDates,
  });
  const recommendationMap = new Map(
    recommendations.map((row) => [row.date, row.recommendedYen]),
  );
  const dailyRows: PeriodDailyRow[] = periodDates.map((date) => ({
    date,
    label: date === jstToday ? "today" : "planned",
    usedYen: dailyTotalsByDate.get(date) ?? 0,
    recommendedYen: recommendationMap.get(date) ?? 0,
  }));
  const todayRecommendedYen = recommendationMap.get(jstToday) ?? 0;
  const varianceFromRecommendationYen = usedTodayYen - todayRecommendedYen;
  const remainingAfterDayYenPreview = remainingAtTodayYen - usedTodayYen;
  const daysRemaining = resolveDaysRemaining(
    period.startDate,
    period.endDate,
    jstToday,
  );

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
    foodPace,
    dailyRows,
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
  listDailyTotalsByPeriodId: (
    periodId: string,
  ) => Promise<PeriodSummaryDailyTotal[]>;
  listHistoryByDate: (
    periodId: string,
    date: string,
  ) => Promise<DailyHistoryRecord[]>;
  nowIso: () => string;
  jstToday: () => string;
};

export type InMemoryApiServicesWithInternals = InMemoryApiServices & {
  databaseClient: DatabaseClient<
    BudgetPeriodRecord,
    DailyTotalRecord,
    DailyHistoryRecord
  >;
  dailyTotalRepository: DailyTotalRepository;
  dailyHistoryRepository: DailyHistoryRepository;
};

export type CreateInMemoryApiServicesInput = {
  now?: () => Date;
  createHistoryId?: () => string;
};

export function createInMemoryApiServices(
  input: CreateInMemoryApiServicesInput = {},
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
    createHistoryId: input.createHistoryId,
  });

  async function assertNoOutOfRangePeriodEntries(
    periodId: string,
    startDate: string,
    endDate: string,
  ): Promise<void> {
    const hasOutOfRangeEntries = await databaseClient.read(async (tx) => {
      const hasOutOfRangeTotal = [...tx.state.dailyTotals.values()].some(
        (row) =>
          row.budgetPeriodId === periodId &&
          !isDateWithinPeriod(row.date, startDate, endDate),
      );
      if (hasOutOfRangeTotal) {
        return true;
      }
      return tx.state.dailyOperationHistories.some(
        (row) =>
          row.budgetPeriodId === periodId &&
          !isDateWithinPeriod(row.date, startDate, endDate),
      );
    });

    if (hasOutOfRangeEntries) {
      throw new PeriodValidationError(
        "PERIOD_HAS_OUT_OF_RANGE_ENTRIES",
        `period ${periodId} has entries outside the updated range`,
      );
    }
  }

  return {
    databaseClient,
    budgetPeriodRepository,
    dailyTotalRepository,
    dailyHistoryRepository,
    dayEntryService: {
      addDailyAmount: (command) =>
        runSerialized(() => rawDayEntryService.addDailyAmount(command)),
      overwriteDailyAmount: (command) =>
        runSerialized(() => rawDayEntryService.overwriteDailyAmount(command)),
    },
    createPeriod: async (periodInput) =>
      runSerialized(() =>
        budgetPeriodRepository.createPeriod({
          ...periodInput,
          nowIso: now().toISOString(),
        }),
      ),
    updatePeriod: async (periodInput) => {
      return runSerialized(async () => {
        await assertNoOutOfRangePeriodEntries(
          periodInput.id,
          periodInput.startDate,
          periodInput.endDate,
        );
        return budgetPeriodRepository.updatePeriod({
          ...periodInput,
          nowIso: now().toISOString(),
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
            totalUsedYen: row.totalUsedYen,
          }))
          .sort((left, right) => left.date.localeCompare(right.date));
      });
    },
    listHistoryByDate: async (periodId, date) => {
      const period = await budgetPeriodRepository.findById(periodId);
      if (!period) {
        throw new PeriodNotFoundError(periodId);
      }
      return databaseClient.read((tx) =>
        dailyHistoryRepository.listHistoriesByDate(tx, date, periodId),
      );
    },
    nowIso: () => now().toISOString(),
    jstToday: () => getJstDateParts(now()).date,
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
  const existing = cacheHost[apiServicesCacheKey] as
    | ApiServicesGlobalCache
    | undefined;
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
];

async function ensureD1Schema(db: D1Database): Promise<void> {
  const cache = getApiServicesGlobalCache();
  cache.d1SchemaReadyByBinding ??= new WeakMap<D1Database, Promise<void>>();
  const existing = cache.d1SchemaReadyByBinding.get(db);
  if (existing) {
    await existing;
    return;
  }

  const initializePromise = db
    .batch(d1SchemaStatements.map((sql) => db.prepare(sql)))
    .then(() => {});
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
  const cryptoObject = globalThis.crypto as
    | { randomUUID?: () => string }
    | undefined;
  if (cryptoObject?.randomUUID) {
    return cryptoObject.randomUUID();
  }
  return `history-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createD1DayEntryService(
  db: D1Database,
  dailyTotalRepository: D1DailyTotalRepository,
  dailyHistoryRepository: D1DailyHistoryRepository,
  now: () => Date,
  createHistoryId: () => string,
): DayEntryServicePort {
  async function execute(
    command: {
      periodId: string;
      date: string;
      inputYen: number;
      memo?: string | null;
    },
    operationType: "add" | "overwrite",
  ) {
    assertValidDate(command.date);
    assertValidInputYen(command.inputYen);
    await ensureD1Schema(db);

    const period = await db
      .prepare(
        `SELECT id, start_date, end_date, budget_yen, status, predecessor_period_id, created_at, updated_at
           FROM budget_periods
          WHERE id = ?`,
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

    const existing = await dailyTotalRepository.findByDate(
      command.date,
      command.periodId,
    );
    const beforeTotalYen = existing?.totalUsedYen ?? 0;
    const afterTotalYen =
      operationType === "add"
        ? beforeTotalYen + command.inputYen
        : command.inputYen;
    const totalMutation = dailyTotalRepository.prepareUpsertDailyTotal(
      {
        budgetPeriodId: command.periodId,
        date: command.date,
        yearMonth: command.date.slice(0, 7),
        totalUsedYen:
          operationType === "add" ? command.inputYen : afterTotalYen,
        nowIso,
      },
      operationType,
    );
    const historyInsert = dailyHistoryRepository.prepareInsertHistory({
      id: createHistoryId(),
      budgetPeriodId: command.periodId,
      date: command.date,
      operationType,
      inputYen: command.inputYen,
      beforeTotalYen,
      afterTotalYen,
      memo,
      createdAt: nowIso,
    });

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
    },
  };
}

export function createD1ApiServices(
  db: D1Database,
  input: CreateInMemoryApiServicesInput = {},
): InMemoryApiServices {
  const now = input.now ?? (() => new Date());
  const budgetPeriodRepository = createD1BudgetPeriodRepository({
    db,
    ensureSchema: () => ensureD1Schema(db),
  });
  const dailyTotalRepository = createD1DailyTotalRepository({
    db,
    ensureSchema: () => ensureD1Schema(db),
  });
  const dailyHistoryRepository = createD1DailyHistoryRepository({
    db,
    ensureSchema: () => ensureD1Schema(db),
  });
  const dayEntryService = createD1DayEntryService(
    db,
    dailyTotalRepository,
    dailyHistoryRepository,
    now,
    input.createHistoryId ?? defaultCreateHistoryId,
  );

  async function assertNoOutOfRangePeriodEntries(
    periodId: string,
    startDate: string,
    endDate: string,
  ): Promise<void> {
    await ensureD1Schema(db);
    const outOfRangeTotal = await dailyTotalRepository.hasEntriesOutsidePeriod(
      periodId,
      startDate,
      endDate,
    );
    const outOfRangeHistory =
      await dailyHistoryRepository.hasEntriesOutsidePeriod(
        periodId,
        startDate,
        endDate,
      );

    if (outOfRangeTotal || outOfRangeHistory) {
      throw new PeriodValidationError(
        "PERIOD_HAS_OUT_OF_RANGE_ENTRIES",
        `period ${periodId} has entries outside the updated range`,
      );
    }
  }

  return {
    budgetPeriodRepository,
    dayEntryService,
    createPeriod: (periodInput) =>
      budgetPeriodRepository.createPeriod({
        ...periodInput,
        nowIso: now().toISOString(),
      }),
    updatePeriod: async (periodInput) => {
      await assertNoOutOfRangePeriodEntries(
        periodInput.id,
        periodInput.startDate,
        periodInput.endDate,
      );
      return budgetPeriodRepository.updatePeriod({
        ...periodInput,
        nowIso: now().toISOString(),
      });
    },
    listPeriods: () => budgetPeriodRepository.listPeriods(),
    listDailyTotalsByPeriodId: async (periodId) => {
      const rows = await dailyTotalRepository.listByPeriodId(periodId);
      return rows.map((row) => ({
        date: row.date,
        budgetPeriodId: row.budgetPeriodId,
        totalUsedYen: row.totalUsedYen,
      }));
    },
    listHistoryByDate: async (periodId, date) => {
      await ensureD1Schema(db);
      const period = await budgetPeriodRepository.findById(periodId);
      if (!period) {
        throw new PeriodNotFoundError(periodId);
      }
      return dailyHistoryRepository.listHistoriesByDate(date, periodId);
    },
    nowIso: () => now().toISOString(),
    jstToday: () => getJstDateParts(now()).date,
  };
}

export function getApiServicesFromPlatform(
  platform?: App.Platform,
): InMemoryApiServices {
  const runtimeProcess = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process;
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
    cache.d1BindingScopedServices ??
    (cache.d1BindingScopedServices = new WeakMap());
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
  periodId: string,
): Promise<PeriodSummary> {
  return buildPeriodSummary(services.budgetPeriodRepository, periodId, {
    jstToday: services.jstToday(),
    dailyTotals: await services.listDailyTotalsByPeriodId(periodId),
  });
}
