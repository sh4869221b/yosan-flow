import type { BudgetPeriodRecord } from "$lib/server/db/budget-period-repository";
import {
  assertValidDate,
  assertValidInputYen,
  normalizeMemo,
} from "$lib/server/domain/daily-entry";
import { isDateWithinPeriod } from "$lib/server/domain/budget-period";

type PeriodDayEntryCommandLike = {
  periodId: string;
  date: string;
  inputYen: number;
  memo?: string | null;
};

type UpdateHistoryCommandLike = {
  periodId: string;
  date: string;
  historyId: string;
  inputYen: number;
  memo?: string | null;
};

export type ExecuteEntryInput = {
  operationType: "add" | "overwrite";
  command: PeriodDayEntryCommandLike;
};

export type PreparedEntryInput = ExecuteEntryInput & {
  period: BudgetPeriodRecord;
  memo: string | null;
  nowIso: string;
};

export function normalizeEntryMemo(
  command: PeriodDayEntryCommandLike,
): string | null {
  assertValidDate(command.date);
  assertValidInputYen(command.inputYen);
  return normalizeMemo(command.memo);
}

export function normalizeUpdatedHistoryMemo(
  command: UpdateHistoryCommandLike,
): string | null {
  assertValidDate(command.date);
  assertValidInputYen(command.inputYen);
  return normalizeMemo(command.memo);
}

export function assertHistoryMutationDate(date: string): void {
  assertValidDate(date);
}

export function assertDateInPeriod(
  date: string,
  period: BudgetPeriodRecord,
  createDateOutOfPeriodError: (date: string, periodId: string) => Error,
): void {
  if (!isDateWithinPeriod(date, period.startDate, period.endDate)) {
    throw createDateOutOfPeriodError(date, period.id);
  }
}

export function createPreparedEntryInput(input: {
  execute: ExecuteEntryInput;
  period: BudgetPeriodRecord;
  memo: string | null;
  nowIso: string;
}): PreparedEntryInput {
  return {
    ...input.execute,
    period: input.period,
    memo: input.memo,
    nowIso: input.nowIso,
  };
}
