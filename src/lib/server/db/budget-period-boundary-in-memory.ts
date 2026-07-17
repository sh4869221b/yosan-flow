import type { Effect } from "effect";
import { clonePeriod } from "$lib/server/db/budget-period-row-mapper";
import {
  LinkedPeriodBoundaryConflictError,
  type BudgetPeriodRecord,
  type LinkedPeriodBoundaryUpdateCommand,
  type LinkedPeriodBoundaryUpdateResult,
} from "$lib/server/db/budget-period-types";
import { getNextPeriodStartDate } from "$lib/server/domain/budget-period";

export type LinkedBoundaryOwnedEntryDates = {
  readonly totalDates: Readonly<Record<string, readonly string[]>>;
  readonly historyDates: Readonly<Record<string, readonly string[]>>;
};

export type InMemoryLinkedBoundaryContext = {
  readonly listOwnedEntryDates: () => LinkedBoundaryOwnedEntryDates;
  readonly runSerializedEffect: <T>(
    work: () => Effect.Effect<T, Error>,
  ) => Effect.Effect<T, Error>;
};

type GateInput = {
  readonly command: LinkedPeriodBoundaryUpdateCommand;
  readonly periods: readonly BudgetPeriodRecord[];
  readonly entries: LinkedBoundaryOwnedEntryDates;
};

type GateResult = {
  readonly target: BudgetPeriodRecord;
  readonly successor: BudgetPeriodRecord;
};

function recordsMatch(
  current: BudgetPeriodRecord | undefined,
  snapshot: Readonly<BudgetPeriodRecord>,
): boolean {
  return (
    current?.id === snapshot.id &&
    current.startDate === snapshot.startDate &&
    current.endDate === snapshot.endDate &&
    current.budgetYen === snapshot.budgetYen &&
    current.status === snapshot.status &&
    current.predecessorPeriodId === snapshot.predecessorPeriodId &&
    current.createdAt === snapshot.createdAt &&
    current.updatedAt === snapshot.updatedAt
  );
}

function isValidNextDate(endDate: string, startDate: string): boolean {
  try {
    return getNextPeriodStartDate(endDate) === startDate;
  } catch (error) {
    if (error instanceof Error) {
      return false;
    }
    throw error;
  }
}

function isValidDate(date: string): boolean {
  try {
    getNextPeriodStartDate(date);
    return true;
  } catch (error) {
    if (error instanceof Error) {
      return false;
    }
    throw error;
  }
}

function hasValidAfterRange(
  before: Readonly<BudgetPeriodRecord>,
  after: LinkedPeriodBoundaryUpdateCommand["target"]["after"],
): boolean {
  return (
    after.id === before.id &&
    after.budgetYen >= 0 &&
    after.startDate <= after.endDate &&
    isValidDate(after.startDate) &&
    isValidDate(after.endDate)
  );
}

function overlaps(
  period: BudgetPeriodRecord,
  proposed: LinkedPeriodBoundaryUpdateCommand["target"]["after"],
): boolean {
  return (
    period.startDate <= proposed.endDate && period.endDate >= proposed.startDate
  );
}

function hasOutsideDate(
  dates: readonly string[] | undefined,
  proposed: LinkedPeriodBoundaryUpdateCommand["target"]["after"],
): boolean {
  return (
    dates?.some(
      (date) => date < proposed.startDate || date > proposed.endDate,
    ) ?? false
  );
}

export function evaluateLinkedPeriodBoundaryGate(input: GateInput): GateResult {
  const { command, entries, periods } = input;
  const byId = new Map(periods.map((period) => [period.id, period]));
  const currentTarget = byId.get(command.target.before.id);
  const currentSuccessor = byId.get(command.successor.before.id);
  const targetPredecessorId = command.target.before.predecessorPeriodId;
  const targetPredecessor = targetPredecessorId
    ? byId.get(targetPredecessorId)
    : undefined;
  const linkedSuccessors = periods.filter(
    (period) => period.predecessorPeriodId === command.target.before.id,
  );
  const excludedIds = new Set([
    command.target.before.id,
    command.successor.before.id,
  ]);
  const thirdOverlap = periods.some(
    (period) =>
      !excludedIds.has(period.id) &&
      (overlaps(period, command.target.after) ||
        overlaps(period, command.successor.after)),
  );
  const targetEntriesOutside =
    hasOutsideDate(
      entries.totalDates[command.target.before.id],
      command.target.after,
    ) ||
    hasOutsideDate(
      entries.historyDates[command.target.before.id],
      command.target.after,
    );
  const successorEntriesOutside =
    hasOutsideDate(
      entries.totalDates[command.successor.before.id],
      command.successor.after,
    ) ||
    hasOutsideDate(
      entries.historyDates[command.successor.before.id],
      command.successor.after,
    );
  const predecessorMatches = targetPredecessorId
    ? Boolean(
        targetPredecessor &&
        isValidNextDate(
          targetPredecessor.endDate,
          command.target.after.startDate,
        ),
      )
    : true;

  if (
    !recordsMatch(currentTarget, command.target.before) ||
    !recordsMatch(currentSuccessor, command.successor.before) ||
    linkedSuccessors.length !== 1 ||
    linkedSuccessors[0]?.id !== command.successor.before.id ||
    !isValidNextDate(
      command.target.before.endDate,
      command.successor.before.startDate,
    ) ||
    !hasValidAfterRange(command.target.before, command.target.after) ||
    !hasValidAfterRange(command.successor.before, command.successor.after) ||
    !isValidNextDate(
      command.target.after.endDate,
      command.successor.after.startDate,
    ) ||
    !predecessorMatches ||
    thirdOverlap ||
    targetEntriesOutside ||
    successorEntriesOutside
  ) {
    throw new LinkedPeriodBoundaryConflictError();
  }

  return {
    target: {
      ...command.target.before,
      startDate: command.target.after.startDate,
      endDate: command.target.after.endDate,
      budgetYen: command.target.after.budgetYen,
      updatedAt: command.nowIso,
    },
    successor: {
      ...command.successor.before,
      startDate: command.successor.after.startDate,
      endDate: command.successor.after.endDate,
      budgetYen: command.successor.after.budgetYen,
      updatedAt: command.nowIso,
    },
  };
}

export function replaceLinkedPeriodBoundary(
  store: Map<string, BudgetPeriodRecord>,
  command: LinkedPeriodBoundaryUpdateCommand,
  entries: LinkedBoundaryOwnedEntryDates,
): LinkedPeriodBoundaryUpdateResult {
  const next = evaluateLinkedPeriodBoundaryGate({
    command,
    periods: [...store.values()],
    entries,
  });
  store.set(next.target.id, next.target);
  store.set(next.successor.id, next.successor);
  return {
    changedCount: 2,
    target: clonePeriod(next.target),
    successor: clonePeriod(next.successor),
  };
}
