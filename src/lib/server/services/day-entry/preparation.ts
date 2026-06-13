import { Effect } from "effect";
import type {
  BudgetPeriodRecord,
  BudgetPeriodRepository,
} from "$lib/server/db/budget-period-repository";
import { toEffectError } from "$lib/server/effect/runtime";
import {
  assertDateInPeriod,
  assertHistoryMutationDate,
  createPreparedEntryInput,
  type ExecuteEntryInput,
  normalizeEntryMemo,
  normalizeUpdatedHistoryMemo,
  type PreparedEntryInput,
} from "./commands";

type PeriodDayEntryCommandLike = {
  periodId: string;
  date: string;
  inputYen: number;
  memo?: string | null;
};

type HistoryMutationCommandLike = {
  periodId: string;
  date: string;
  historyId: string;
};

type UpdateHistoryCommandLike = HistoryMutationCommandLike & {
  inputYen: number;
  memo?: string | null;
};

type EntryPreparationErrors = {
  createPeriodNotFoundError: (periodId: string) => Error;
  createDateOutOfPeriodError: (date: string, periodId: string) => Error;
};

type EntryPreparationInput = {
  execute: ExecuteEntryInput;
  budgetPeriodRepository: BudgetPeriodRepository;
  now: () => string;
  errors: EntryPreparationErrors;
};

export function validateHistoryUpdateEffect(
  command: UpdateHistoryCommandLike,
): Effect.Effect<string | null, Error> {
  return Effect.try({
    try: () => normalizeUpdatedHistoryMemo(command),
    catch: toEffectError,
  });
}

export function validateHistoryDeleteEffect(
  command: HistoryMutationCommandLike,
): Effect.Effect<void, Error> {
  return Effect.try({
    try: () => assertHistoryMutationDate(command.date),
    catch: toEffectError,
  });
}

export function validatePeriodDateEffect(input: {
  date: string;
  period: BudgetPeriodRecord;
  createDateOutOfPeriodError: (date: string, periodId: string) => Error;
}): Effect.Effect<void, Error> {
  return Effect.try({
    try: () =>
      assertDateInPeriod(
        input.date,
        input.period,
        input.createDateOutOfPeriodError,
      ),
    catch: toEffectError,
  });
}

export function prepareEntryEffect(
  input: EntryPreparationInput,
): Effect.Effect<PreparedEntryInput, Error> {
  return Effect.gen(function* () {
    const memo = yield* Effect.try({
      try: () => normalizeEntryMemo(input.execute.command),
      catch: toEffectError,
    });
    const nowIso = input.now();

    const period = yield* input.budgetPeriodRepository.findById(
      input.execute.command.periodId,
    );
    if (!period) {
      return yield* Effect.fail(
        input.errors.createPeriodNotFoundError(input.execute.command.periodId),
      );
    }
    yield* validatePeriodDateEffect({
      date: input.execute.command.date,
      period,
      createDateOutOfPeriodError: input.errors.createDateOutOfPeriodError,
    });

    return createPreparedEntryInput({
      execute: input.execute,
      period,
      memo,
      nowIso,
    });
  });
}

export type { ExecuteEntryInput, PeriodDayEntryCommandLike };
