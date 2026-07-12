import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHistoryControllerState } from "$lib/dashboard/history-controller-state.svelte";

afterEach(() => {
  vi.unstubAllGlobals();
});

function historyResponse(id: string): Response {
  return new Response(JSON.stringify({ histories: [{ id }] }), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

describe("history controller request generation", () => {
  it("does not let an older history response replace a newer refresh", async () => {
    const olderResponse = Promise.withResolvers<Response>();
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => olderResponse.promise)
      .mockResolvedValueOnce(historyResponse("new"));
    vi.stubGlobal("fetch", fetchMock);
    const controller = createHistoryControllerState({
      getSelectedDate: () => "2026-07-12",
      getSelectedPeriodId: () => "period-1",
      setSelectedRow: vi.fn(),
      setSummary: vi.fn(),
    });

    const olderRun = Effect.runPromise(
      controller.loadHistoryEffect("2026-07-12"),
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const newerRun = Effect.runPromise(
      controller.loadHistoryEffect("2026-07-12"),
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await newerRun;
    olderResponse.resolve(historyResponse("old"));
    await olderRun;

    expect(controller.histories).toEqual([{ id: "new" }]);
  });
});
