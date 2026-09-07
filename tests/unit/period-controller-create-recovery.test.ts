import { expect, it, vi } from "vitest";
import {
  captureClientEffects,
  settled,
} from "./period-controller-effect-fixture";
import { createDashboardPageController } from "$lib/dashboard/page-controller.svelte";
import { createSummary } from "./day-entry-controller-test-fixtures";

const executions = captureClientEffects();
const period = {
  id: "period-1",
  startDate: "2026-09-01",
  endDate: "2026-09-30",
  budgetYen: 120_000,
  status: "active" as const,
  predecessorPeriodId: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

function createController() {
  return createDashboardPageController(() => ({
    today: period.startDate,
    periods: [period],
    selectedPeriodId: period.id,
    summary: {
      ...createSummary(0),
      periodId: period.id,
      startDate: period.startDate,
      endDate: period.endDate,
      budgetYen: period.budgetYen,
    },
  }));
}

it("preserves edited create ID when applying a create range", () => {
  const controller = createController();
  const automatic = createController();

  controller.createPeriodId = "p-custom";
  controller.updateCreatePeriodRange({
    startDate: "2026-10-01",
    endDate: "2026-10-30",
  });
  expect(controller.createPeriodId).toBe("p-custom");
  controller.createPeriodId = "p-2026-09-01";
  controller.updateCreatePeriodRange({
    startDate: "2026-11-01",
    endDate: "2026-11-30",
  });
  automatic.updateCreatePeriodRange({
    startDate: "2026-10-01",
    endDate: "2026-10-30",
  });

  expect(controller.createPeriodId).toBe("p-2026-09-01");
  expect(automatic.createPeriodId).toBe("p-2026-10-01");
  expect(controller.createSaving).toBe(false);
  expect(controller.createError).toBeNull();
  expect(controller.createdPeriodId).toBeNull();
  expect(controller.createdRefreshPending).toBe(false);
});

it("rejects invalid create budget without changing settings state", async () => {
  const controller = createController();
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  controller.createBudgetInput = "1000abc";
  controller.createInitialPeriod();
  await settled(executions[0]);

  expect(fetchMock).not.toHaveBeenCalled();
  expect(controller.createBudgetInput).toBe("1000abc");
  expect(controller.createError).not.toBeNull();
  expect(controller.createSaving).toBe(false);
  expect(controller.periodError).toBe(controller.createError);
  expect(controller.budget).toMatchObject({
    saving: false,
    validationError: null,
    serverError: null,
  });
  expect(controller.range).toMatchObject({
    saving: false,
    serverError: null,
    validationErrors: { startDate: null, endDate: null, range: null },
  });
});
