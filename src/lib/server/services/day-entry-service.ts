import type { DatabaseClient, DatabaseTransaction } from "$lib/server/db/client";
import type {
  DailyHistoryRecord,
  DailyHistoryRepository
} from "$lib/server/db/daily-history-repository";
import type { DailyTotalRecord, DailyTotalRepository } from "$lib/server/db/daily-total-repository";
import type { MonthRecord, TransactionalMonthRepository } from "$lib/server/db/month-repository";
import {
  assertValidDate,
  assertValidInputYen,
  normalizeMemo,
  toYearMonth,
  type DayEntryCommand
} from "$lib/server/domain/daily-entry";

type DayEntryTransaction = DatabaseTransaction<MonthRecord, DailyTotalRecord, DailyHistoryRecord>;

type DayEntryServiceInput = {
  databaseClient: DatabaseClient<MonthRecord, DailyTotalRecord, DailyHistoryRecord>;
  monthRepository: TransactionalMonthRepository;
  dailyTotalRepository: DailyTotalRepository;
  dailyHistoryRepository: DailyHistoryRepository;
  now?: () => string;
  createHistoryId?: () => string;
};

type ExecuteEntryInput = {
  operationType: "add" | "overwrite";
  command: DayEntryCommand;
};

export type DayEntryResult = {
  dailyTotal: DailyTotalRecord;
  history: DailyHistoryRecord;
};

export class BudgetNotSetError extends Error {
  readonly code = "BUDGET_NOT_SET";

  constructor(yearMonth: string) {
    super(`Budget not set for ${yearMonth}`);
    this.name = "BudgetNotSetError";
  }
}

function defaultNow(): string {
  return new Date().toISOString();
}

function defaultCreateHistoryId(): string {
  const cryptoObject = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (cryptoObject?.randomUUID) {
    return cryptoObject.randomUUID();
  }

  return `history-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export class DayEntryService {
  private readonly databaseClient: DatabaseClient<MonthRecord, DailyTotalRecord, DailyHistoryRecord>;
  private readonly monthRepository: TransactionalMonthRepository;
  private readonly dailyTotalRepository: DailyTotalRepository;
  private readonly dailyHistoryRepository: DailyHistoryRepository;
  private readonly now: () => string;
  private readonly createHistoryId: () => string;

  constructor(input: DayEntryServiceInput) {
    this.databaseClient = input.databaseClient;
    this.monthRepository = input.monthRepository;
    this.dailyTotalRepository = input.dailyTotalRepository;
    this.dailyHistoryRepository = input.dailyHistoryRepository;
    this.now = input.now ?? defaultNow;
    this.createHistoryId = input.createHistoryId ?? defaultCreateHistoryId;
  }

  async requireBudgetSet(yearMonth: string, tx: DayEntryTransaction): Promise<MonthRecord> {
    const month = await this.monthRepository.findMonth(tx, yearMonth);
    if (!month || month.budgetStatus !== "set" || month.budgetYen == null) {
      throw new BudgetNotSetError(yearMonth);
    }

    return month;
  }

  async addDailyAmount(command: DayEntryCommand): Promise<DayEntryResult> {
    return this.executeEntry({
      operationType: "add",
      command
    });
  }

  async overwriteDailyAmount(command: DayEntryCommand): Promise<DayEntryResult> {
    return this.executeEntry({
      operationType: "overwrite",
      command
    });
  }

  private async executeEntry(input: ExecuteEntryInput): Promise<DayEntryResult> {
    assertValidDate(input.command.date);
    assertValidInputYen(input.command.inputYen);

    const yearMonth = toYearMonth(input.command.date);
    const nowIso = this.now();
    const memo = normalizeMemo(input.command.memo);

    return this.databaseClient.transaction(async (tx) => {
      await this.requireBudgetSet(yearMonth, tx);

      const existingTotal = await this.dailyTotalRepository.findByDate(tx, input.command.date);
      const beforeTotalYen = existingTotal?.totalUsedYen ?? 0;
      const afterTotalYen =
        input.operationType === "add" ? beforeTotalYen + input.command.inputYen : input.command.inputYen;

      const dailyTotal = await this.dailyTotalRepository.upsertDailyTotal(tx, {
        date: input.command.date,
        yearMonth,
        totalUsedYen: afterTotalYen,
        nowIso
      });
      const history = await this.dailyHistoryRepository.insertHistory(tx, {
        id: this.createHistoryId(),
        date: input.command.date,
        operationType: input.operationType,
        inputYen: input.command.inputYen,
        beforeTotalYen,
        afterTotalYen,
        memo,
        createdAt: nowIso
      });

      return {
        dailyTotal,
        history
      };
    });
  }
}
