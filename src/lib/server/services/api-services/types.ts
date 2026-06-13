import type { Effect } from "effect";
import type { DatabaseClient } from "$lib/server/db/client";
import type { D1Database } from "$lib/server/db/d1-types";
import type {
  BudgetPeriodRecord,
  BudgetPeriodRepository,
} from "$lib/server/db/budget-period-repository";
import type {
  DailyHistoryRecord,
  DailyHistoryRepository,
} from "$lib/server/db/daily-history-repository";
import type {
  DailyTotalRecord,
  DailyTotalRepository,
} from "$lib/server/db/daily-total-repository";
import type { PeriodSummaryDailyTotal } from "$lib/server/services/period-summary/period-summary-calculator";

export type DayEntryServicePort = {
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
  updateHistoryEntry(command: {
    periodId: string;
    date: string;
    historyId: string;
    inputYen: number;
    memo?: string | null;
  }): Effect.Effect<unknown, Error>;
  deleteHistoryEntry(command: {
    periodId: string;
    date: string;
    historyId: string;
  }): Effect.Effect<unknown, Error>;
};

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

export type ApiServicesGlobalCache = {
  defaultInMemoryApiServices?: InMemoryApiServices;
  d1BindingScopedServices?: WeakMap<D1Database, InMemoryApiServices>;
};
