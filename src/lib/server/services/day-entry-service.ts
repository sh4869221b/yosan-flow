import { Effect } from "effect";
import { assertValidDate } from "#lib/server/domain/daily-entry.ts";
import { toEffectError } from "#lib/server/effect/runtime.ts";
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

export {
  PeriodNotFoundError,
  DateOutOfPeriodError,
  HistoryNotFoundError,
} from "./day-entry/errors";

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
      yield* Effect.try({
        try: () => assertValidDate(command.date),
        catch: toEffectError,
      });
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
