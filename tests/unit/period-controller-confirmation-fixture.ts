import { createPeriodControllerState } from "$lib/dashboard/period-controller-state.svelte";
import { createPeriodSummaryRevision } from "$lib/dashboard/period-summary-revision";
import type { PeriodBoundaryUpdateProposal } from "$lib/dashboard/period-update-api";
import type { PeriodSummary } from "$lib/dashboard/controller-types";
import { createSummary } from "./day-entry-controller-test-fixtures";

export const targetPeriod = {
  id: "period-1",
  startDate: "2026-07-12",
  endDate: "2026-07-13",
  budgetYen: 10_000,
  status: "active" as const,
  predecessorPeriodId: null,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

export const successorPeriod = {
  ...targetPeriod,
  id: "period-2",
  startDate: "2026-07-14",
  endDate: "2026-08-12",
  budgetYen: 20_000,
  predecessorPeriodId: targetPeriod.id,
};

export const proposal: PeriodBoundaryUpdateProposal = {
  version: 1,
  target: {
    before: targetPeriod,
    after: {
      id: targetPeriod.id,
      startDate: targetPeriod.startDate,
      endDate: successorPeriod.startDate,
      budgetYen: targetPeriod.budgetYen,
    },
  },
  successor: {
    before: successorPeriod,
    after: {
      id: successorPeriod.id,
      startDate: "2026-07-15",
      endDate: successorPeriod.endDate,
      budgetYen: successorPeriod.budgetYen,
    },
  },
};

export const confirmationBody = {
  error: {
    code: "PERIOD_BOUNDARY_CONFIRMATION_REQUIRED",
    message: "この変更には後続期間の確認が必要です。",
  },
  proposal,
};

export function forPeriod(
  summary: PeriodSummary,
  periodId: string,
): PeriodSummary {
  return { ...summary, periodId };
}

export function updatedTargetSummary(): PeriodSummary {
  return {
    ...createSummary(0),
    endDate: proposal.target.after.endDate,
    budgetYen: proposal.target.after.budgetYen,
  };
}

export function createController(revision = createPeriodSummaryRevision()) {
  return createPeriodControllerState(
    {
      today: targetPeriod.startDate,
      periods: [targetPeriod, successorPeriod],
      selectedPeriodId: targetPeriod.id,
      summary: createSummary(0),
    },
    revision,
  );
}
