import {
  evaluateLinkedPeriodBoundaryGate,
  type LinkedBoundaryOwnedEntryDates,
} from "$lib/server/db/budget-period-boundary-in-memory";
import {
  LinkedPeriodBoundaryConflictError,
  type BudgetPeriodRecord,
  type LinkedPeriodBoundaryAfter,
  type LinkedPeriodBoundaryUpdateCommand,
} from "$lib/server/db/budget-period-types";
import type { PeriodAwareD1FakeState } from "./table-state";
import type { BudgetPeriodRow } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string") {
    throw new Error(`Invalid linked boundary payload field: ${key}`);
  }
  return value;
}

function readNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== "number") {
    throw new Error(`Invalid linked boundary payload field: ${key}`);
  }
  return value;
}

function parsePeriodRecord(value: unknown): BudgetPeriodRecord {
  if (!isRecord(value)) {
    throw new Error("Invalid linked boundary period snapshot");
  }
  const status = value.status;
  const predecessorPeriodId = value.predecessorPeriodId;
  if (status !== "active" && status !== "closed") {
    throw new Error("Invalid linked boundary period status");
  }
  if (predecessorPeriodId !== null && typeof predecessorPeriodId !== "string") {
    throw new Error("Invalid linked boundary predecessor");
  }
  return {
    id: readString(value, "id"),
    startDate: readString(value, "startDate"),
    endDate: readString(value, "endDate"),
    budgetYen: readNumber(value, "budgetYen"),
    status,
    predecessorPeriodId,
    createdAt: readString(value, "createdAt"),
    updatedAt: readString(value, "updatedAt"),
  };
}

function parseAfter(value: unknown): LinkedPeriodBoundaryAfter {
  if (!isRecord(value)) {
    throw new Error("Invalid linked boundary after values");
  }
  return {
    id: readString(value, "id"),
    startDate: readString(value, "startDate"),
    endDate: readString(value, "endDate"),
    budgetYen: readNumber(value, "budgetYen"),
  };
}

function parseSide(value: unknown) {
  if (!isRecord(value)) {
    throw new Error("Invalid linked boundary side");
  }
  return {
    before: parsePeriodRecord(value.before),
    after: parseAfter(value.after),
  };
}

function parseCommand(payload: unknown): LinkedPeriodBoundaryUpdateCommand {
  if (!isRecord(payload)) {
    throw new Error("Invalid linked boundary command");
  }
  return {
    target: parseSide(payload.target),
    successor: parseSide(payload.successor),
    nowIso: readString(payload, "nowIso"),
  };
}

function toRecord(row: BudgetPeriodRow): BudgetPeriodRecord {
  return {
    id: row.id,
    startDate: row.start_date,
    endDate: row.end_date,
    budgetYen: row.budget_yen,
    status: row.status,
    predecessorPeriodId: row.predecessor_period_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRow(record: BudgetPeriodRecord): BudgetPeriodRow {
  return {
    id: record.id,
    start_date: record.startDate,
    end_date: record.endDate,
    budget_yen: record.budgetYen,
    status: record.status,
    predecessor_period_id: record.predecessorPeriodId,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

function listEntryDates(
  state: PeriodAwareD1FakeState,
): LinkedBoundaryOwnedEntryDates {
  const totalDates: Record<string, string[]> = {};
  const historyDates: Record<string, string[]> = {};
  for (const total of state.dailyTotals.values()) {
    (totalDates[total.budget_period_id] ??= []).push(total.date);
  }
  for (const history of state.dailyOperationHistories) {
    (historyDates[history.budget_period_id] ??= []).push(history.date);
  }
  return { totalDates, historyDates };
}

export function applyLinkedBoundaryMutation(
  sql: string,
  args: unknown[],
  state: PeriodAwareD1FakeState,
  changesOverride?: number,
): number | null {
  const normalizedSql = sql.toLowerCase();
  if (
    !normalizedSql.includes("linked_boundary_input") ||
    !normalizedSql.includes("case")
  ) {
    return null;
  }
  const payloadText = args.find(
    (value) => typeof value === "string" && value.startsWith('{"target":'),
  );
  if (typeof payloadText !== "string") {
    throw new Error("Linked boundary CASE update omitted its payload binding");
  }
  const parsed: unknown = JSON.parse(payloadText);
  const command = parseCommand(parsed);
  try {
    const next = evaluateLinkedPeriodBoundaryGate({
      command,
      periods: [...state.periods.values()].map(toRecord),
      entries: listEntryDates(state),
    });
    if (changesOverride !== undefined) {
      return changesOverride;
    }
    state.periods.set(next.target.id, toRow(next.target));
    state.periods.set(next.successor.id, toRow(next.successor));
    return 2;
  } catch (error) {
    if (error instanceof LinkedPeriodBoundaryConflictError) {
      return 0;
    }
    throw error;
  }
}
