import { Effect } from "effect";
import { afterEach, expect, it, vi } from "vitest";
import { createDayEntryControllerState } from "$lib/dashboard/day-entry-controller-state.svelte";
import { createPeriodControllerState } from "$lib/dashboard/period-controller-state.svelte";
import { createPeriodSummaryRevision } from "$lib/dashboard/period-summary-revision";
import type { PeriodSummary } from "$lib/dashboard/controller-types";
import {
  createSummary,
  jsonResponse,
} from "./day-entry-controller-test-fixtures";

afterEach(() => vi.unstubAllGlobals());

const period = {
  id: "period-1",
  startDate: "2026-07-12",
  endDate: "2026-07-13",
  budgetYen: 10_000,
  status: "active" as const,
  predecessorPeriodId: null,
  createdAt: "2026-07-12T00:00:00.000Z",
  updatedAt: "2026-07-12T00:00:00.000Z",
};

function withBudget(summary: PeriodSummary, budgetYen: number): PeriodSummary {
  return { ...summary, budgetYen };
}

it("serializes a period update between earlier and later add groups", async () => {
  const firstAddResponse = Promise.withResolvers<Response>();
  const putResponse = Promise.withResolvers<Response>();
  const secondAddResponse = Promise.withResolvers<Response>();
  const initialSummary = createSummary(0);
  const firstAddSummary = createSummary(1_000);
  const updatedSummary = withBudget(firstAddSummary, 12_000);
  const finalSummary = withBudget(createSummary(3_000), 12_000);
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "POST" && fetchMock.mock.calls.length === 1) {
      return firstAddResponse.promise;
    }
    if (method === "PUT") return putResponse.promise;
    if (method === "POST") return secondAddResponse.promise;
    return Promise.resolve(jsonResponse({ error: {} }, 503));
  });
  vi.stubGlobal("fetch", fetchMock);
  const revision = createPeriodSummaryRevision();
  const periodController = createPeriodControllerState(
    {
      today: "2026-07-12",
      periods: [period],
      selectedPeriodId: period.id,
      summary: initialSummary,
    },
    revision,
  );
  const dayController = createDayEntryControllerState(
    {
      getSelectedPeriodId: () => periodController.selectedPeriodId,
      getSummary: () => periodController.summary,
      historyController: {
        getMutationSequence: () => 0,
        loadHistory: vi.fn(),
        loadHistoryEffect: () => Effect.void,
        resetHistories: vi.fn(),
      },
      setSummary: periodController.setSummary,
    },
    revision,
  );

  dayController.submitDayEntry({
    date: "2026-07-12",
    inputYen: 1_000,
    memo: "first add",
  });
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  periodController.handleSavePeriod({ budgetYen: 12_000 });
  dayController.submitDayEntry({
    date: "2026-07-13",
    inputYen: 2_000,
    memo: "second add",
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(fetchMock).toHaveBeenCalledOnce();

  firstAddResponse.resolve(jsonResponse(firstAddSummary));
  await vi.waitFor(() =>
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "PUT"),
    ).toBe(true),
  );
  expect(
    fetchMock.mock.calls.filter(([, init]) => init?.method === "POST"),
  ).toHaveLength(1);

  putResponse.resolve(jsonResponse(updatedSummary));
  await vi.waitFor(() =>
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(2),
  );
  secondAddResponse.resolve(jsonResponse(finalSummary));

  await vi.waitFor(() =>
    expect(periodController.summary).toEqual(finalSummary),
  );
});
