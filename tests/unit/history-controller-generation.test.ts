import { Effect, Fiber } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHistoryControllerState } from "#lib/dashboard/history-controller-state.svelte.ts";

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
  it("does not start a deferred history read after its selected period changes", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const date = "2026-07-12";
    let periodId = "period-1";
    const controller = createHistoryControllerState({
      getSelectedDate: () => date,
      getSelectedPeriodId: () => periodId,
      setSelectedRow: vi.fn(),
      setSummary: vi.fn(),
    });

    const read = controller.loadHistoryEffect(date);
    periodId = "period-2";
    await Effect.runPromise(read);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(controller.historyLoading).toBe(false);
  });

  it.each([false, true])(
    "releases only its own loading state on interruption (newer request: %s)",
    async (hasNewerRequest) => {
      const newerResponse = Promise.withResolvers<Response>();
      const fetchMock = vi
        .fn()
        .mockReturnValueOnce(new Promise<Response>(() => {}))
        .mockReturnValueOnce(newerResponse.promise);
      vi.stubGlobal("fetch", fetchMock);
      const date = "2026-07-12";
      const controller = createHistoryControllerState({
        getSelectedDate: () => date,
        getSelectedPeriodId: () => "period-1",
        setSelectedRow: vi.fn(),
        setSummary: vi.fn(),
      });

      const olderRequest = Effect.runFork(controller.loadHistoryEffect(date));
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
      expect(controller.historyLoading).toBe(true);

      const newerRequest = hasNewerRequest
        ? Effect.runPromise(controller.loadHistoryEffect(date))
        : undefined;
      if (newerRequest) {
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      }

      await Effect.runPromise(Fiber.interrupt(olderRequest));
      expect(controller.historyLoading).toBe(hasNewerRequest);
      expect(controller.historyError).toBeNull();
      if (newerRequest) {
        newerResponse.resolve(historyResponse("newer"));
        await newerRequest;
        expect(controller.historyLoading).toBe(false);
        expect(controller.histories).toEqual([{ id: "newer" }]);
      }
    },
  );

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

  it("clears loading when the selected period changes during the latest request", async () => {
    const response = Promise.withResolvers<Response>();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => response.promise),
    );
    let selectedPeriodId = "period-1";
    const controller = createHistoryControllerState({
      getSelectedDate: () => "2026-07-12",
      getSelectedPeriodId: () => selectedPeriodId,
      setSelectedRow: vi.fn(),
      setSummary: vi.fn(),
    });

    const loading = Effect.runPromise(
      controller.loadHistoryEffect("2026-07-12"),
    );
    await vi.waitFor(() => expect(controller.historyLoading).toBe(true));
    selectedPeriodId = "period-2";
    response.resolve(historyResponse("old period"));
    await loading;

    expect(controller.historyLoading).toBe(false);
    expect(controller.histories).toEqual([]);
  });
});
