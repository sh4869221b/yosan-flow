import { afterEach, expect, it, vi } from "vitest";
import { createHistoryControllerState } from "#lib/dashboard/history-controller-state.svelte.ts";
import { createDayEntrySyncState } from "#lib/dashboard/day-entry-sync-state.svelte.ts";
import { createPeriodSummaryRevision } from "#lib/dashboard/period-summary-revision.ts";
import {
  createSummary,
  jsonResponse,
} from "./day-entry-controller-test-fixtures";

afterEach(() => vi.unstubAllGlobals());

it("does not expose an old reconciliation error after selection changes", async () => {
  const mutationResponse = Promise.withResolvers<Response>();
  const oldHistoryResponse = Promise.withResolvers<Response>();
  const fetchMock = vi
    .fn()
    .mockImplementationOnce(() => mutationResponse.promise)
    .mockResolvedValueOnce(jsonResponse({ error: {} }, 503))
    .mockImplementationOnce(() => oldHistoryResponse.promise);
  vi.stubGlobal("fetch", fetchMock);
  let selectedPeriodId = "period-1";
  let selectedDate = "2026-07-12";
  const sync = createDayEntrySyncState(() => selectedPeriodId);
  sync.markPending(selectedPeriodId, selectedDate);
  const revision = createPeriodSummaryRevision(sync.captureSummarySync);
  let summary = createSummary(0);
  const controller = createHistoryControllerState(
    {
      getSelectedDate: () => selectedDate,
      getSelectedPeriodId: () => selectedPeriodId,
      getSummary: () => summary,
      setSelectedRow: vi.fn(),
      setSummary: (nextSummary) => {
        summary = nextSummary;
      },
    },
    revision,
  );

  controller.updateHistory({
    historyId: "history-1",
    inputYen: 1_000,
    memo: "old selection",
  });
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  revision.publish(createSummary(2_000), (nextSummary) => {
    summary = nextSummary;
  });
  mutationResponse.resolve(
    jsonResponse({ summary: createSummary(1_000), histories: [] }),
  );
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  expect(summary).toEqual(createSummary(2_000));
  expect(sync.pending).toBe(true);

  selectedPeriodId = "period-2";
  selectedDate = "2026-07-13";
  oldHistoryResponse.resolve(jsonResponse({ histories: [] }));
  await vi.waitFor(() => expect(controller.historyMutatingId).toBeNull());

  expect(controller.historyError).toBeNull();
});
