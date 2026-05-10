import { Effect } from "effect";
import type { DatabaseClient } from "$lib/server/db/client";
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
import {
  assertValidDate,
  assertValidInputYen,
  normalizeMemo,
} from "$lib/server/domain/daily-entry";
import { isDateWithinPeriod } from "$lib/server/domain/budget-period";
import { toEffectError } from "$lib/server/effect/runtime";

type DayEntryServiceInput = {
  databaseClient: DatabaseClient<
    BudgetPeriodRecord,
    DailyTotalRecord,
    DailyHistoryRecord
  >;
  budgetPeriodRepository: BudgetPeriodRepository;
  dailyTotalRepository: DailyTotalRepository;
  dailyHistoryRepository: DailyHistoryRepository;
  now?: () => string;
  createHistoryId?: () => string;
};

export type PeriodDayEntryCommand = {
  periodId: string;
  date: string;
  inputYen: number;
  memo?: string | null;
};

type ExecuteEntryInput = {
  operationType: "add" | "overwrite";
  command: PeriodDayEntryCommand;
};

type PreparedEntryInput = ExecuteEntryInput & {
  period: BudgetPeriodRecord;
  memo: string | null;
  nowIso: string;
};

export type DayEntryResult = {
  dailyTotal: DailyTotalRecord;
  history: DailyHistoryRecord;
};

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

function defaultNow(): string {
  return new Date().toISOString();
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

export class DayEntryService {
  private readonly databaseClient: DatabaseClient<
    BudgetPeriodRecord,
    DailyTotalRecord,
    DailyHistoryRecord
  >;
  private readonly budgetPeriodRepository: BudgetPeriodRepository;
  private readonly dailyTotalRepository: DailyTotalRepository;
  private readonly dailyHistoryRepository: DailyHistoryRepository;
  private readonly now: () => string;
  private readonly createHistoryId: () => string;

  constructor(input: DayEntryServiceInput) {
    this.databaseClient = input.databaseClient;
    this.budgetPeriodRepository = input.budgetPeriodRepository;
    this.dailyTotalRepository = input.dailyTotalRepository;
    this.dailyHistoryRepository = input.dailyHistoryRepository;
    this.now = input.now ?? defaultNow;
    this.createHistoryId = input.createHistoryId ?? defaultCreateHistoryId;
  }

  addDailyAmount(
    command: PeriodDayEntryCommand,
  ): Effect.Effect<DayEntryResult, Error> {
    return this.executeEntryEffect({
      operationType: "add",
      command,
    });
  }

  overwriteDailyAmount(
    command: PeriodDayEntryCommand,
  ): Effect.Effect<DayEntryResult, Error> {
    return this.executeEntryEffect({
      operationType: "overwrite",
      command,
    });
  }

  private executeEntryEffect(
    input: ExecuteEntryInput,
  ): Effect.Effect<DayEntryResult, Error> {
    return Effect.gen(this, function* () {
      const prepared = yield* this.prepareEntryEffect(input);
      return yield* this.persistEntryEffect(prepared);
    });
  }

  private prepareEntryEffect(
    input: ExecuteEntryInput,
  ): Effect.Effect<PreparedEntryInput, Error> {
    return Effect.gen(this, function* () {
      const memo = yield* Effect.try({
        try: () => {
          assertValidDate(input.command.date);
          assertValidInputYen(input.command.inputYen);
          return normalizeMemo(input.command.memo);
        },
        catch: toEffectError,
      });
      const nowIso = this.now();

      const period = yield* this.budgetPeriodRepository.findById(
        input.command.periodId,
      );
      if (!period) {
        return yield* Effect.fail(
          new PeriodNotFoundError(input.command.periodId),
        );
      }
      if (
        !isDateWithinPeriod(
          input.command.date,
          period.startDate,
          period.endDate,
        )
      ) {
        return yield* Effect.fail(
          new DateOutOfPeriodError(input.command.date, period.id),
        );
      }

      return {
        ...input,
        period,
        memo,
        nowIso,
      };
    });
  }

  private persistEntryEffect(
    input: PreparedEntryInput,
  ): Effect.Effect<DayEntryResult, Error> {
    return this.databaseClient.transaction((tx) =>
      Effect.gen(this, function* () {
        const existingTotal = yield* this.dailyTotalRepository.findByDate(
          tx,
          input.command.date,
          input.period.id,
        );
        const beforeTotalYen = existingTotal?.totalUsedYen ?? 0;
        const afterTotalYen =
          input.operationType === "add"
            ? beforeTotalYen + input.command.inputYen
            : input.command.inputYen;

        const dailyTotal = yield* this.dailyTotalRepository.upsertDailyTotal(
          tx,
          {
            date: input.command.date,
            yearMonth: input.command.date.slice(0, 7),
            budgetPeriodId: input.period.id,
            totalUsedYen: afterTotalYen,
            nowIso: input.nowIso,
          },
        );
        const history = yield* this.dailyHistoryRepository.insertHistory(tx, {
          id: this.createHistoryId(),
          date: input.command.date,
          budgetPeriodId: input.period.id,
          operationType: input.operationType,
          inputYen: input.command.inputYen,
          beforeTotalYen,
          afterTotalYen,
          memo: input.memo,
          createdAt: input.nowIso,
        });

        return {
          dailyTotal,
          history,
        };
      }),
    );
  }
}
