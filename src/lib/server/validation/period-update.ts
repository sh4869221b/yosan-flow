import type {
  PeriodBoundaryAfter,
  PeriodBoundaryUpdateProposal,
  PeriodSnapshot,
  PeriodUpdateRequest,
} from "$lib/server/services/period-update/period-update-types";
import { parseDate } from "$lib/server/validation/day";
import {
  ApiRouteError,
  parseNonNegativeIntegerYen,
} from "$lib/server/validation/month";

const INVALID_BODY_MESSAGE = "リクエスト JSON が不正です。";

function invalidBody(): ApiRouteError {
  return new ApiRouteError(400, "INVALID_BODY", INVALID_BODY_MESSAGE);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function parseRequiredString(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw invalidBody();
  }
  return value;
}

function parseProposalDate(value: unknown): string {
  const date = parseRequiredString(value);
  try {
    return parseDate(date);
  } catch (error) {
    if (error instanceof Error) {
      throw invalidBody();
    }
    throw error;
  }
}

function parseProposalBudget(value: unknown): number {
  if (!Number.isInteger(value) || typeof value !== "number" || value < 0) {
    throw invalidBody();
  }
  return value;
}

function parseSnapshot(value: unknown): PeriodSnapshot {
  if (
    !isObject(value) ||
    !hasExactKeys(value, [
      "id",
      "startDate",
      "endDate",
      "budgetYen",
      "status",
      "predecessorPeriodId",
      "createdAt",
      "updatedAt",
    ])
  ) {
    throw invalidBody();
  }
  const status = value.status;
  const predecessorPeriodId = value.predecessorPeriodId;
  if (
    (status !== "active" && status !== "closed") ||
    (predecessorPeriodId !== null && typeof predecessorPeriodId !== "string")
  ) {
    throw invalidBody();
  }
  return {
    id: parseRequiredString(value.id),
    startDate: parseProposalDate(value.startDate),
    endDate: parseProposalDate(value.endDate),
    budgetYen: parseProposalBudget(value.budgetYen),
    status,
    predecessorPeriodId,
    createdAt: parseRequiredString(value.createdAt),
    updatedAt: parseRequiredString(value.updatedAt),
  };
}

function parseAfter(value: unknown): PeriodBoundaryAfter {
  if (
    !isObject(value) ||
    !hasExactKeys(value, ["id", "startDate", "endDate", "budgetYen"])
  ) {
    throw invalidBody();
  }
  return {
    id: parseRequiredString(value.id),
    startDate: parseProposalDate(value.startDate),
    endDate: parseProposalDate(value.endDate),
    budgetYen: parseProposalBudget(value.budgetYen),
  };
}

function parseProposalSide(value: unknown): {
  readonly before: PeriodSnapshot;
  readonly after: PeriodBoundaryAfter;
} {
  if (!isObject(value) || !hasExactKeys(value, ["before", "after"])) {
    throw invalidBody();
  }
  return {
    before: parseSnapshot(value.before),
    after: parseAfter(value.after),
  };
}

export function parsePeriodBoundaryUpdateProposal(
  value: unknown,
): PeriodBoundaryUpdateProposal {
  if (
    !isObject(value) ||
    !hasExactKeys(value, ["version", "target", "successor"]) ||
    value.version !== 1
  ) {
    throw invalidBody();
  }
  return {
    version: 1,
    target: parseProposalSide(value.target),
    successor: parseProposalSide(value.successor),
  };
}

export function parsePeriodUpdateRequest(
  body: Readonly<Record<string, unknown>>,
): PeriodUpdateRequest {
  const startDate = parseDate(
    typeof body.startDate === "string" ? body.startDate : undefined,
  );
  const endDate = parseDate(
    typeof body.endDate === "string" ? body.endDate : undefined,
  );
  const budgetYen = parseNonNegativeIntegerYen(body.budgetYen, "budgetYen");
  if (!("confirmation" in body)) {
    return { startDate, endDate, budgetYen };
  }
  return {
    startDate,
    endDate,
    budgetYen,
    confirmation: parsePeriodBoundaryUpdateProposal(body.confirmation),
  };
}
