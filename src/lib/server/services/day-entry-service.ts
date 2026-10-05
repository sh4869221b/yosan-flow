import { Effect } from "effect";
import type { DatabaseClient } from "#lib/server/db/client.ts";
import type {
  BudgetPeriodRecord,
  BudgetPeriodRepository,
} from "#lib/server/db/budget-period-repository.ts";
import type {
  DailyHistoryRecord,
  DailyHistoryRepository,
} from "#lib/server/db/daily-history-repository.ts";
import type {
  DailyTotalRecord,
  DailyTotalRepository,
} from "#lib/server/db/daily-total-repository.ts";
import { createHistoryId as createDefaultHistoryId } from "#lib/server/services/history-id.ts";
import { persistEntryEffect } from "./day-entry/entry-persistence";
import { replayHistoryMutationEffect } from "./day-entry/history-mutation";
import {
  prepareEntryEffect,
  validateHistoryDeleteEffect,
  validateEntryInputEffect,
  type ExecuteEntryInput,
} from "./day-entry/preparation";

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

export type HistoryMutationCommand = {
  periodId: string;
  date: string;
  historyId: string;
};

export type UpdateHistoryCommand = HistoryMutationCommand & {
  inputYen: number;
  memo?: string | null;
};

export type DayEntryResult = {
  dailyTotal: DailyTotalRecord;
  history: DailyHistoryRecord;
};

export type HistoryReplayResult = {
  dailyTotal: DailyTotalRecord;
  histories: DailyHistoryRecord[];
};

export class PeriodNotFoundError extends Error {
  // fallow-ignore-next-line unused-class-member -- Read dynamically by effect/result.ts for the stable API error contract.
  readonly code = "PERIOD_NOT_FOUND";

  constructor(periodId: string) {
    super(`Period not found: ${periodId}`);
    this.name = "PeriodNotFoundError";
  }
}

export class DateOutOfPeriodError extends Error {
  // fallow-ignore-next-line unused-class-member -- Read dynamically by effect/result.ts for the stable API error contract.
  readonly code = "DATE_OUT_OF_PERIOD";

  constructor(date: string, periodId: string) {
    super(`Date ${date} is outside period ${periodId}`);
    this.name = "DateOutOfPeriodError";
  }
}

export class HistoryNotFoundError extends Error {
  // fallow-ignore-next-line unused-class-member -- Read dynamically by effect/result.ts for the stable API error contract.
  readonly code = "HISTORY_NOT_FOUND";

  constructor(historyId: string) {
    super(`History not found: ${historyId}`);
    this.name = "HistoryNotFoundError";
  }
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
    this.now = input.now ?? (() => new Date().toISOString());
    this.createHistoryId = input.createHistoryId ?? createDefaultHistoryId;
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

  updateHistoryEntry(
    command: UpdateHistoryCommand,
  ): Effect.Effect<HistoryReplayResult, Error> {
    return Effect.gen({ self: this }, function* () {
      const memo = yield* validateEntryInputEffect(command);
      return yield* replayHistoryMutationEffect({
        ...this.createHistoryMutationInput(command),
        mutateTarget: (history) => ({
          ...history,
          inputYen: command.inputYen,
          memo,
        }),
      });
    });
  }

  deleteHistoryEntry(
    command: HistoryMutationCommand,
  ): Effect.Effect<HistoryReplayResult, Error> {
    return Effect.gen({ self: this }, function* () {
      yield* validateHistoryDeleteEffect(command);
      return yield* replayHistoryMutationEffect({
        ...this.createHistoryMutationInput(command),
        mutateTarget: () => null,
      });
    });
  }

  private createHistoryMutationInput(command: HistoryMutationCommand) {
    return {
      command,
      databaseClient: this.databaseClient,
      budgetPeriodRepository: this.budgetPeriodRepository,
      dailyTotalRepository: this.dailyTotalRepository,
      dailyHistoryRepository: this.dailyHistoryRepository,
      now: this.now,
      errors: {
        createPeriodNotFoundError: (periodId: string) =>
          new PeriodNotFoundError(periodId),
        createDateOutOfPeriodError: (date: string, periodId: string) =>
          new DateOutOfPeriodError(date, periodId),
        createHistoryNotFoundError: (historyId: string) =>
          new HistoryNotFoundError(historyId),
      },
    };
  }

  private executeEntryEffect(
    input: ExecuteEntryInput,
  ): Effect.Effect<DayEntryResult, Error> {
    return Effect.gen({ self: this }, function* () {
      const prepared = yield* prepareEntryEffect({
        execute: input,
        budgetPeriodRepository: this.budgetPeriodRepository,
        now: this.now,
        errors: {
          createPeriodNotFoundError: (periodId) =>
            new PeriodNotFoundError(periodId),
          createDateOutOfPeriodError: (date, periodId) =>
            new DateOutOfPeriodError(date, periodId),
        },
      });
      return yield* persistEntryEffect({
        databaseClient: this.databaseClient,
        dailyTotalRepository: this.dailyTotalRepository,
        dailyHistoryRepository: this.dailyHistoryRepository,
        createHistoryId: this.createHistoryId,
        prepared,
      });
    });
  }
}
