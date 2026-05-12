import { Effect } from "effect";
import {
  createInMemoryDatabaseClient,
  type DatabaseClient,
} from "$lib/server/db/client";
import type { D1Database } from "$lib/server/db/d1-types";
import {
  createD1DayEntryWriter,
  type D1DayEntryWriter,
} from "$lib/server/db/day-entry-writer";
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
import { toEffectError } from "$lib/server/effect/runtime";
import { DayEntryService } from "$lib/server/services/day-entry-service";
import { createHistoryId as createDefaultHistoryId } from "$lib/server/services/history-id";
import { getJstDateParts } from "$lib/server/time/jst";

class PeriodNotFoundError extends Error {
  readonly code = "PERIOD_NOT_FOUND";

  constructor(periodId: string) {
    super(`Period not found: ${periodId}`);
    this.name = "PeriodNotFoundError";
  }
}

class DateOutOfPeriodError extends Error {
  readonly code = "DATE_OUT_OF_PERIOD";

  constructor(date: string, periodId: string) {
    super(`Date ${date} is outside period ${periodId}`);
    this.name = "DateOutOfPeriodError";
  }
}

type PeriodDailyRow = {
  date: string;
  label: "today" | "planned";
  usedYen: number;
  recommendedYen: number;
};

type PeriodSummaryDailyTotal = {
  date: string;
  budgetPeriodId: string;
  totalUsedYen: number;
};

type FoodPaceStatus = "bonus" | "adjustment" | "on_track";

type FoodPaceSummary = {
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

type DayEntryServicePort = {
  addDailyAmount(command: {
    periodId: string;
    date: string;
    inputYen: number;
    memo?: string | null;
  }): Effect.Effect<unknown, Error>;
  overwriteDailyAmount(command: {
    periodId: string;
    date: string;
    inputYen: number;
    memo?: string | null;
  }): Effect.Effect<unknown, Error>;
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

export function buildPeriodSummary(
  budgetPeriodRepository: BudgetPeriodRepository,
  periodId: string,
  options: BuildPeriodSummaryOptions = {},
): Effect.Effect<PeriodSummary, Error> {
  return Effect.gen(function* () {
    const period = yield* budgetPeriodRepository.findById(periodId);
    if (!period) {
      return yield* Effect.fail(new PeriodNotFoundError(periodId));
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
  });
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
  }) => Effect.Effect<BudgetPeriodRecord, Error>;
  updatePeriod: (input: {
    id: string;
    startDate: string;
    endDate: string;
    budgetYen: number;
  }) => Effect.Effect<BudgetPeriodRecord, Error>;
  listPeriods: () => Effect.Effect<BudgetPeriodRecord[], Error>;
  listDailyTotalsByPeriodId: (
    periodId: string,
  ) => Effect.Effect<PeriodSummaryDailyTotal[], Error>;
  listHistoryByDate: (
    periodId: string,
    date: string,
  ) => Effect.Effect<DailyHistoryRecord[], Error>;
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
  function runSerializedEffect<T>(
    work: () => Effect.Effect<T, Error>,
  ): Effect.Effect<T, Error> {
    return Effect.gen(function* () {
      const pending = mutationQueue;
      let releaseQueue: (() => void) | undefined;
      mutationQueue = new Promise<void>((resolve) => {
        releaseQueue = resolve;
      });

      yield* Effect.tryPromise({
        try: () => pending,
        catch: toEffectError,
      });

      return yield* work().pipe(
        Effect.ensuring(
          Effect.sync(() => {
            releaseQueue?.();
          }),
        ),
      );
    });
  }

  const rawDayEntryService = new DayEntryService({
    databaseClient,
    budgetPeriodRepository,
    dailyTotalRepository,
    dailyHistoryRepository,
    now: () => now().toISOString(),
    createHistoryId: input.createHistoryId,
  });

  function assertNoOutOfRangePeriodEntries(
    periodId: string,
    startDate: string,
    endDate: string,
  ): Effect.Effect<void, Error> {
    return Effect.gen(function* () {
      const hasOutOfRangeEntries = yield* databaseClient.read((tx) =>
        Effect.succeed(
          [...tx.state.dailyTotals.values()].some(
            (row) =>
              row.budgetPeriodId === periodId &&
              !isDateWithinPeriod(row.date, startDate, endDate),
          ) ||
            tx.state.dailyOperationHistories.some(
              (row) =>
                row.budgetPeriodId === periodId &&
                !isDateWithinPeriod(row.date, startDate, endDate),
            ),
        ),
      );

      if (hasOutOfRangeEntries) {
        return yield* Effect.fail(
          new PeriodValidationError(
            "PERIOD_HAS_OUT_OF_RANGE_ENTRIES",
            `period ${periodId} has entries outside the updated range`,
          ),
        );
      }
    });
  }

  return {
    databaseClient,
    budgetPeriodRepository,
    dailyTotalRepository,
    dailyHistoryRepository,
    dayEntryService: {
      addDailyAmount: (command) =>
        runSerializedEffect(() => rawDayEntryService.addDailyAmount(command)),
      overwriteDailyAmount: (command) =>
        runSerializedEffect(() =>
          rawDayEntryService.overwriteDailyAmount(command),
        ),
    },
    createPeriod: (periodInput) =>
      runSerializedEffect(() =>
        budgetPeriodRepository.createPeriod({
          ...periodInput,
          nowIso: now().toISOString(),
        }),
      ),
    updatePeriod: (periodInput) =>
      runSerializedEffect(() =>
        Effect.gen(function* () {
          yield* assertNoOutOfRangePeriodEntries(
            periodInput.id,
            periodInput.startDate,
            periodInput.endDate,
          );

          return yield* budgetPeriodRepository.updatePeriod({
            ...periodInput,
            nowIso: now().toISOString(),
          });
        }),
      ),
    listPeriods: () => budgetPeriodRepository.listPeriods(),
    listDailyTotalsByPeriodId: (periodId) =>
      databaseClient.read((tx) =>
        Effect.succeed(
          [...tx.state.dailyTotals.values()]
            .filter((row) => row.budgetPeriodId === periodId)
            .map((row) => ({
              date: row.date,
              budgetPeriodId: row.budgetPeriodId,
              totalUsedYen: row.totalUsedYen,
            }))
            .sort((left, right) => left.date.localeCompare(right.date)),
        ),
      ),
    listHistoryByDate: (periodId, date) =>
      Effect.gen(function* () {
        const period = yield* budgetPeriodRepository.findById(periodId);
        if (!period) {
          return yield* Effect.fail(new PeriodNotFoundError(periodId));
        }
        return yield* databaseClient.read((tx) =>
          dailyHistoryRepository.listHistoriesByDate(tx, date, periodId),
        );
      }),
    nowIso: () => now().toISOString(),
    jstToday: () => getJstDateParts(now()).date,
  };
}

type ApiServicesGlobalCache = {
  defaultInMemoryApiServices?: InMemoryApiServices;
  d1BindingScopedServices?: WeakMap<D1Database, InMemoryApiServices>;
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

function getDefaultInMemoryApiServices(): InMemoryApiServices {
  const cache = getApiServicesGlobalCache();
  const existing = cache.defaultInMemoryApiServices;
  if (existing) {
    return existing;
  }

  const created = createInMemoryApiServices();
  cache.defaultInMemoryApiServices = created;
  return created;
}

function createD1DayEntryService(
  dailyTotalRepository: D1DailyTotalRepository,
  budgetPeriodRepository: BudgetPeriodRepository,
  dayEntryWriter: D1DayEntryWriter,
  now: () => Date,
  createHistoryId: () => string,
): DayEntryServicePort {
  function execute(
    command: {
      periodId: string;
      date: string;
      inputYen: number;
      memo?: string | null;
    },
    operationType: "add" | "overwrite",
  ): Effect.Effect<Record<string, never>, Error> {
    return Effect.gen(function* () {
      yield* Effect.try({
        try: () => {
          assertValidDate(command.date);
          assertValidInputYen(command.inputYen);
        },
        catch: toEffectError,
      });

      const period = yield* budgetPeriodRepository.findById(command.periodId);
      if (!period) {
        return yield* Effect.fail(new PeriodNotFoundError(command.periodId));
      }
      if (!isDateWithinPeriod(command.date, period.startDate, period.endDate)) {
        return yield* Effect.fail(
          new DateOutOfPeriodError(command.date, command.periodId),
        );
      }

      const nowIso = now().toISOString();
      const memo = normalizeMemo(command.memo);
      const existing = yield* dailyTotalRepository.findByDate(
        command.date,
        command.periodId,
      );
      const beforeTotalYen = existing?.totalUsedYen ?? 0;
      const afterTotalYen =
        operationType === "add"
          ? beforeTotalYen + command.inputYen
          : command.inputYen;
      yield* dayEntryWriter.writeDailyEntry({
        total: {
          budgetPeriodId: command.periodId,
          date: command.date,
          yearMonth: command.date.slice(0, 7),
          totalUsedYen:
            operationType === "add" ? command.inputYen : afterTotalYen,
          nowIso,
        },
        history: {
          id: createHistoryId(),
          budgetPeriodId: command.periodId,
          date: command.date,
          operationType,
          inputYen: command.inputYen,
          beforeTotalYen,
          afterTotalYen,
          memo,
          createdAt: nowIso,
        },
        mode: operationType,
      });
      return {};
    });
  }

  return {
    addDailyAmount: (command) => execute(command, "add"),
    overwriteDailyAmount: (command) => execute(command, "overwrite"),
  };
}

export function createD1ApiServices(
  db: D1Database,
  input: CreateInMemoryApiServicesInput = {},
): InMemoryApiServices {
  const now = input.now ?? (() => new Date());
  const budgetPeriodRepository = createD1BudgetPeriodRepository({
    db,
  });
  const dailyTotalRepository = createD1DailyTotalRepository({
    db,
  });
  const dailyHistoryRepository = createD1DailyHistoryRepository({
    db,
  });
  const dayEntryWriter = createD1DayEntryWriter({
    db,
  });
  const dayEntryService = createD1DayEntryService(
    dailyTotalRepository,
    budgetPeriodRepository,
    dayEntryWriter,
    now,
    input.createHistoryId ?? createDefaultHistoryId,
  );

  function assertNoOutOfRangePeriodEntries(
    periodId: string,
    startDate: string,
    endDate: string,
  ): Effect.Effect<void, Error> {
    return Effect.gen(function* () {
      const outOfRangeTotal =
        yield* dailyTotalRepository.hasEntriesOutsidePeriod(
          periodId,
          startDate,
          endDate,
        );
      const outOfRangeHistory =
        yield* dailyHistoryRepository.hasEntriesOutsidePeriod(
          periodId,
          startDate,
          endDate,
        );

      if (outOfRangeTotal || outOfRangeHistory) {
        return yield* Effect.fail(
          new PeriodValidationError(
            "PERIOD_HAS_OUT_OF_RANGE_ENTRIES",
            `period ${periodId} has entries outside the updated range`,
          ),
        );
      }
    });
  }

  return {
    budgetPeriodRepository,
    dayEntryService,
    createPeriod: (periodInput) =>
      budgetPeriodRepository.createPeriod({
        ...periodInput,
        nowIso: now().toISOString(),
      }),
    updatePeriod: (periodInput) =>
      Effect.gen(function* () {
        yield* assertNoOutOfRangePeriodEntries(
          periodInput.id,
          periodInput.startDate,
          periodInput.endDate,
        );
        return yield* budgetPeriodRepository.updatePeriod({
          ...periodInput,
          nowIso: now().toISOString(),
        });
      }),
    listPeriods: () => budgetPeriodRepository.listPeriods(),
    listDailyTotalsByPeriodId: (periodId) =>
      dailyTotalRepository.listByPeriodId(periodId).pipe(
        Effect.map((rows) =>
          rows.map((row) => ({
            date: row.date,
            budgetPeriodId: row.budgetPeriodId,
            totalUsedYen: row.totalUsedYen,
          })),
        ),
      ),
    listHistoryByDate: (periodId, date) =>
      Effect.gen(function* () {
        const period = yield* budgetPeriodRepository.findById(periodId);
        if (!period) {
          return yield* Effect.fail(new PeriodNotFoundError(periodId));
        }
        return yield* dailyHistoryRepository.listHistoriesByDate(
          date,
          periodId,
        );
      }),
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

export function getPeriodSummaryFromServices(
  services: InMemoryApiServices,
  periodId: string,
): Effect.Effect<PeriodSummary, Error> {
  return Effect.gen(function* () {
    const dailyTotals = yield* services.listDailyTotalsByPeriodId(periodId);
    return yield* buildPeriodSummary(
      services.budgetPeriodRepository,
      periodId,
      {
        jstToday: services.jstToday(),
        dailyTotals,
      },
    );
  });
}
