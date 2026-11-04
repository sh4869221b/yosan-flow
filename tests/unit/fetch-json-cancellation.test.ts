import { Effect, Fiber } from "effect";
import { afterEach, expect, it, vi } from "vitest";
import { fetchJsonEffect } from "#lib/dashboard/fetch-json.ts";
import { createDayEntryMutationLifecycle } from "#lib/dashboard/day-entry-mutation-lifecycle.ts";
import { createPeriodSummaryRevision } from "#lib/dashboard/period-summary-revision.ts";
import {
  createSummary,
  jsonResponse,
} from "./day-entry-controller-test-fixtures";

afterEach(() => vi.unstubAllGlobals());

function pendingFetch(signal: AbortSignal): Promise<Response> {
  return new Promise((_resolve, reject) => {
    if (signal.aborted) reject(signal.reason);
    else
      signal.addEventListener("abort", () => reject(signal.reason), {
        once: true,
      });
  });
}

it.each([undefined, "GET", "head"])(
  "aborts an interrupted %s read and removes the caller listener",
  async (method) => {
    const caller = new AbortController();
    const remove = vi.spyOn(caller.signal, "removeEventListener");
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, init: RequestInit) => {
        signal = init.signal!;
        return pendingFetch(signal);
      }),
    );
    const fiber = Effect.runFork(
      fetchJsonEffect("/read", { method, signal: caller.signal }, "fallback"),
    );
    await vi.waitFor(() => expect(signal).toBeDefined());
    await Effect.runPromise(Fiber.interrupt(fiber));
    expect(signal!.aborted).toBe(true);
    expect(caller.signal.aborted).toBe(false);
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  },
);

it.each([false, true])(
  "preserves caller cancellation (pre-aborted: %s)",
  async (preAborted) => {
    const caller = new AbortController();
    if (preAborted) caller.abort("cancelled");
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, init: RequestInit) => {
        signal = init.signal!;
        return pendingFetch(signal);
      }),
    );
    const fiber = Effect.runFork(
      Effect.result(
        fetchJsonEffect("/read", { signal: caller.signal }, "fallback"),
      ),
    );
    await vi.waitFor(() => expect(signal).toBeDefined());
    if (!preAborted) caller.abort("cancelled");
    const result = await Effect.runPromise(Fiber.join(fiber));
    expect(result).toMatchObject({ _tag: "Failure", failure: "fallback" });
    expect(signal!.reason).toBe("cancelled");
  },
);

it.each([200, 500])(
  "aborts interruption while parsing a %s response body",
  async (status) => {
    let signal: AbortSignal | undefined;
    const reading = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, init: RequestInit) => {
        signal = init.signal!;
        const body = new ReadableStream({
          start(controller) {
            signal!.addEventListener(
              "abort",
              () => controller.error(signal!.reason),
              { once: true },
            );
          },
        });
        const response = new Response(body, { status });
        const json = response.json.bind(response);
        response.json = () => {
          reading();
          return json();
        };
        return Promise.resolve(response);
      }),
    );
    const fiber = Effect.runFork(
      fetchJsonEffect("/read", undefined, "fallback"),
    );
    await vi.waitFor(() => expect(reading).toHaveBeenCalledOnce());
    await Effect.runPromise(Fiber.interrupt(fiber));
    expect(signal!.aborted).toBe(true);
  },
);

it.each(["POST", "PUT", "PATCH", "DELETE"])(
  "leaves interrupted %s requests under caller control",
  async (method) => {
    const caller = new AbortController();
    const fetchMock = vi.fn((_url, init: RequestInit) =>
      pendingFetch(init.signal!),
    );
    vi.stubGlobal("fetch", fetchMock);
    const fiber = Effect.runFork(
      fetchJsonEffect(
        "/mutation",
        { method, signal: caller.signal },
        "fallback",
      ),
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    await Effect.runPromise(Fiber.interrupt(fiber));
    expect(fetchMock.mock.calls[0][1].signal).toBe(caller.signal);
    expect(caller.signal.aborted).toBe(false);
    caller.abort();
  },
);

it("removes the caller listener after successful reads without aborting the response", async () => {
  const caller = new AbortController();
  const remove = vi.spyOn(caller.signal, "removeEventListener");
  let signal: AbortSignal | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn((_url, init: RequestInit) => {
      signal = init.signal!;
      return Promise.resolve(jsonResponse({ ok: true }));
    }),
  );
  expect(
    await Effect.runPromise(
      fetchJsonEffect("/read", { signal: caller.signal }, "fallback"),
    ),
  ).toEqual({ ok: true });
  expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  caller.abort();
  expect(signal!.aborted).toBe(false);
});

it("aborts the post-save history read when the modal session changes", async () => {
  let historySignal: AbortSignal | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn((url, init: RequestInit) => {
      if (url !== "/history")
        return Promise.resolve(jsonResponse(createSummary(500)));
      historySignal = init.signal!;
      return pendingFetch(historySignal);
    }),
  );
  const lifecycle = createDayEntryMutationLifecycle({
    closeModal: vi.fn(),
    getHistoryMutationSequence: () => 0,
    getModalOpen: () => true,
    getSelectionSequence: () => 0,
    getSelectedDate: () => "2026-07-12",
    getSelectedPeriodId: () => "period-1",
    getSummary: () => createSummary(0),
    loadHistoryEffect: () =>
      fetchJsonEffect("/history", undefined, "fallback").pipe(
        Effect.catch(() => Effect.void),
        Effect.asVoid,
      ),
    publishSaveSuccess: vi.fn(),
    setError: vi.fn(),
    setSaving: vi.fn(),
    setSelectedRow: vi.fn(),
    setSummary: vi.fn(),
    summaryRevision: createPeriodSummaryRevision(),
  });
  lifecycle.beginModalSession();
  const fiber = Effect.runFork(
    lifecycle.submitEffect({ date: "2026-07-12", inputYen: 500, memo: "" }),
  );
  try {
    await vi.waitFor(() => expect(historySignal).toBeDefined());
    lifecycle.beginModalSession();
    await Effect.runPromise(Fiber.join(fiber).pipe(Effect.timeout("1 second")));
    expect(historySignal!.aborted).toBe(true);
  } finally {
    await Effect.runPromise(Fiber.interrupt(fiber));
  }
});
