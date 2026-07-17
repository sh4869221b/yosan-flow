import { describe, expect, it } from "vitest";
import { decidePeriodBoundaryUpdate } from "$lib/server/services/period-update/period-boundary-decision";
import {
  PERIOD_BOUNDARY_CONFIRMATION_REQUIRED_ERROR,
  PERIOD_UPDATE_CONFLICT_ERROR,
  PeriodMultipleSuccessorsError,
  PeriodUpdateConflictError,
} from "$lib/server/services/period-update/period-update-types";
import type {
  PeriodSnapshot,
  PeriodUpdateRequest,
} from "$lib/server/services/period-update/period-update-types";

const target: PeriodSnapshot = {
  id: "period-target",
  startDate: "2026-06-21",
  endDate: "2026-07-20",
  budgetYen: 120_000,
  status: "active",
  predecessorPeriodId: null,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-20T00:00:00.000Z",
};

const successor: PeriodSnapshot = {
  id: "period-successor",
  startDate: "2026-07-21",
  endDate: "2026-08-19",
  budgetYen: 90_000,
  status: "active",
  predecessorPeriodId: target.id,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-20T00:00:00.000Z",
};

const requested: PeriodUpdateRequest = {
  startDate: target.startDate,
  endDate: "2026-07-21",
  budgetYen: 125_000,
};

describe("period boundary update decision", () => {
  it("builds a confirmation proposal for one linked successor", () => {
    // Given one currently continuous linked successor
    const input = { target, successors: [successor], requested };

    // When an end-date extension reaches that successor
    const result = decidePeriodBoundaryUpdate(input);

    // Then the complete persisted snapshots and exact derived dates are proposed
    expect(result).toEqual({
      kind: "confirmation-required",
      proposal: {
        version: 1,
        target: {
          before: target,
          after: {
            id: target.id,
            startDate: "2026-06-21",
            endDate: "2026-07-21",
            budgetYen: 125_000,
          },
        },
        successor: {
          before: successor,
          after: {
            id: successor.id,
            startDate: "2026-07-22",
            endDate: "2026-08-19",
            budgetYen: 90_000,
          },
        },
      },
    });
  });

  it("uses the requested target start date in the proposal", () => {
    // Given a valid requested start that differs from the persisted snapshot
    const requestedWithNewStart = {
      ...requested,
      startDate: "2026-06-22",
    };

    // When the linked boundary proposal is built
    const result = decidePeriodBoundaryUpdate({
      target,
      successors: [successor],
      requested: requestedWithNewStart,
    });

    // Then target after preserves the request rather than the persisted start
    expect(result).toMatchObject({
      kind: "confirmation-required",
      proposal: {
        target: { after: { startDate: "2026-06-22" } },
      },
    });
  });

  it.each([
    ["an unchanged end", target.endDate, [successor]],
    ["a shortened end", "2026-07-19", [successor]],
    [
      "an extension before the successor",
      "2026-07-22",
      [{ ...successor, startDate: "2026-07-25" }],
    ],
    ["an extension without a successor", "2026-07-21", []],
  ])("keeps %s on the ordinary update path", (_case, endDate, successors) => {
    // Given a request that does not require a linked boundary move
    const input = {
      target,
      successors,
      requested: { ...requested, endDate },
    };

    // When the boundary decision is made
    const result = decidePeriodBoundaryUpdate(input);

    // Then existing update validation remains authoritative
    expect(result).toEqual({ kind: "ordinary-update" });
  });

  it("rejects multiple or invalid successors", () => {
    // Given each invalid linked-successor state
    const secondSuccessor = { ...successor, id: "period-successor-2" };
    const brokenSuccessor = { ...successor, startDate: "2026-07-22" };
    const tooShortSuccessor = { ...successor, endDate: "2026-07-21" };

    // When and then each boundary decision is attempted
    expect(() =>
      decidePeriodBoundaryUpdate({
        target,
        successors: [successor, secondSuccessor],
        requested,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: "PERIOD_MULTIPLE_SUCCESSORS",
        message: "後続の予算期間が複数存在するため、変更できません。",
      }),
    );
    expect(() =>
      decidePeriodBoundaryUpdate({
        target,
        successors: [brokenSuccessor],
        requested: { ...requested, endDate: "2026-07-22" },
      }),
    ).toThrowError(
      expect.objectContaining({ code: "PERIOD_CONTINUITY_VIOLATION" }),
    );
    expect(() =>
      decidePeriodBoundaryUpdate({
        target,
        successors: [tooShortSuccessor],
        requested,
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_PERIOD_RANGE" }));
  });

  it("rejects malformed requested dates without producing a proposal", () => {
    // Given a malformed end date that reaches a linked successor lexically
    const malformedRequest = { ...requested, endDate: "2026-07-99" };

    // When and then the real date boundary evaluates it
    expect(() =>
      decidePeriodBoundaryUpdate({
        target,
        successors: [successor],
        requested: malformedRequest,
      }),
    ).toThrowError(
      expect.objectContaining({
        name: "PeriodValidationError",
        code: "INVALID_PERIOD_RANGE",
        message: "Invalid period: 2026-06-21..2026-07-99",
      }),
    );
  });

  it("exposes the stable boundary error contracts", () => {
    // Given the stable domain errors
    const multipleSuccessorsError = new PeriodMultipleSuccessorsError();
    const updateConflictError = new PeriodUpdateConflictError();

    // When and then their machine codes and public messages are observed
    expect(PERIOD_BOUNDARY_CONFIRMATION_REQUIRED_ERROR).toEqual({
      code: "PERIOD_BOUNDARY_CONFIRMATION_REQUIRED",
      message: "この変更には後続期間の確認が必要です。",
    });
    expect(multipleSuccessorsError).toMatchObject({
      code: "PERIOD_MULTIPLE_SUCCESSORS",
      message: "後続の予算期間が複数存在するため、変更できません。",
    });
    expect(PERIOD_UPDATE_CONFLICT_ERROR).toEqual({
      code: "PERIOD_UPDATE_CONFLICT",
      message: "確認後に予算期間が変更されたため、もう一度操作してください。",
    });
    expect(updateConflictError).toMatchObject(PERIOD_UPDATE_CONFLICT_ERROR);
  });
});
