import type {
  BudgetPeriodRecord,
  LinkedPeriodBoundaryUpdateCommand,
} from "#lib/server/db/budget-period-types.ts";

export const target: BudgetPeriodRecord = {
  id: "target",
  startDate: "2026-06-21",
  endDate: "2026-07-20",
  budgetYen: 100_000,
  status: "active",
  predecessorPeriodId: null,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

export const successor: BudgetPeriodRecord = {
  id: "successor",
  startDate: "2026-07-21",
  endDate: "2026-08-19",
  budgetYen: 120_000,
  status: "closed",
  predecessorPeriodId: target.id,
  createdAt: "2026-06-02T00:00:00.000Z",
  updatedAt: "2026-06-02T00:00:00.000Z",
};

export const malformedCommand: LinkedPeriodBoundaryUpdateCommand = {
  target: {
    before: target,
    after: { ...target, startDate: "2026-02-30", endDate: "2026-07-21" },
  },
  successor: {
    before: successor,
    after: { ...successor, startDate: "2026-07-22" },
  },
  nowIso: "2026-07-18T00:00:00.000Z",
};

export function toD1Row(period: BudgetPeriodRecord) {
  return {
    id: period.id,
    start_date: period.startDate,
    end_date: period.endDate,
    budget_yen: period.budgetYen,
    status: period.status,
    predecessor_period_id: period.predecessorPeriodId,
    created_at: period.createdAt,
    updated_at: period.updatedAt,
  };
}

export const laterBoundary: LinkedPeriodBoundaryUpdateCommand = {
  target: { before: target, after: { ...target, endDate: "2026-07-21" } },
  successor: {
    before: successor,
    after: { ...successor, startDate: "2026-07-22" },
  },
  nowIso: "2026-07-18T00:00:00.000Z",
};

export const earlierBoundary: LinkedPeriodBoundaryUpdateCommand = {
  ...laterBoundary,
  target: { before: target, after: { ...target, endDate: "2026-07-19" } },
  successor: {
    before: successor,
    after: { ...successor, startDate: "2026-07-20" },
  },
};
