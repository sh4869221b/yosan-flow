import { afterEach, expect, it, vi } from "vitest";
import { createPeriodControllerState } from "$lib/dashboard/period-controller-state.svelte";
import { createPeriodSummaryRevision } from "$lib/dashboard/period-summary-revision";
import {
  createSummary,
  jsonResponse,
} from "./day-entry-controller-test-fixtures";

afterEach(() => vi.unstubAllGlobals());

const firstPeriod = {
  id: "period-1",
  startDate: "2026-07-12",
  endDate: "2026-07-13",
  budgetYen: 10_000,
  status: "active" as const,
  predecessorPeriodId: null,
  createdAt: "2026-07-12T00:00:00.000Z",
  updatedAt: "2026-07-12T00:00:00.000Z",
};
const secondPeriod = {
  ...firstPeriod,
  id: "period-2",
  startDate: "2026-07-14",
  endDate: "2026-07-15",
};
const thirdPeriod = {
  ...firstPeriod,
  id: "period-3",
  startDate: "2026-07-16",
  endDate: "2026-07-17",
};

it("replays only the latest rapid period selection after an active mutation", async () => {
  const summaryRevision = createPeriodSummaryRevision();
  const mutation = summaryRevision.beginMutation(thirdPeriod.id);
  const selectedSummary = {
    ...createSummary(0),
    periodId: thirdPeriod.id,
  };
  const requestedPeriodIds: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const periodId = String(input).split("/").at(-1) ?? "";
      requestedPeriodIds.push(periodId);
      return Promise.resolve(jsonResponse({ ...createSummary(0), periodId }));
    }),
  );
  const controller = createPeriodControllerState(
    {
      today: "2026-07-12",
      periods: [firstPeriod, secondPeriod, thirdPeriod],
      selectedPeriodId: firstPeriod.id,
      summary: createSummary(0),
    },
    summaryRevision,
  );

  controller.handleSelectPeriod({ periodId: secondPeriod.id });
  controller.handleSelectPeriod({ periodId: thirdPeriod.id });
  summaryRevision.completeMutation(thirdPeriod.id, mutation);

  await vi.waitFor(() => expect(controller.summary).toEqual(selectedSummary));
  expect(controller.selectedPeriodId).toBe(thirdPeriod.id);
  expect(requestedPeriodIds).toEqual([secondPeriod.id, thirdPeriod.id]);
});
