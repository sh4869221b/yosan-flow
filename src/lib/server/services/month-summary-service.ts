import { createInMemoryDatabaseClient, type DatabaseClient } from "$lib/server/db/client";
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
import { buildDailyRecommendations } from "$lib/server/domain/reallocation";
import { DayEntryService } from "$lib/server/services/day-entry-service";
import { getJstDateParts } from "$lib/server/time/jst";

export type MonthStatus = "initialized" | "uninitialized";

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
  if (yearMonth < todayYearMonth) {
    return [];
  }

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

  if (month) {
    return {
      yearMonth: month.yearMonth,
      monthStatus: "initialized",
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
      daysRemaining: dailyRows.length,
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
    daysRemaining: dailyRows.length,
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
  databaseClient: DatabaseClient<MonthRecord, DailyTotalRecord, DailyHistoryRecord>;
  monthRepository: MonthRepository;
  transactionalMonthRepository: TransactionalMonthRepository;
  dailyTotalRepository: DailyTotalRepository;
  dailyHistoryRepository: DailyHistoryRepository;
  dayEntryService: DayEntryService;
  listDailyTotalsByYearMonth: (yearMonth: string) => Promise<MonthSummaryDailyTotal[]>;
  listHistoryByDate: (date: string) => Promise<DailyHistoryRecord[]>;
  nowIso: () => string;
  jstToday: () => string;
};

export type CreateInMemoryApiServicesInput = {
  now?: () => Date;
  createHistoryId?: () => string;
};

export function createInMemoryApiServices(
  input: CreateInMemoryApiServicesInput = {}
): InMemoryApiServices {
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

const defaultApiServicesKey = Symbol.for("yosan-flow.default-api-services");

export function getDefaultInMemoryApiServices(): InMemoryApiServices {
  const globalObject = globalThis as Record<string | symbol, unknown>;
  const existing = globalObject[defaultApiServicesKey] as InMemoryApiServices | undefined;
  if (existing) {
    return existing;
  }

  const created = createInMemoryApiServices();
  globalObject[defaultApiServicesKey] = created;
  return created;
}
