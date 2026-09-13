import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createTracing,
  noopTracing,
  type NativeTracing,
} from "$lib/server/observability/tracing";
import type { TelemetryEvent } from "$lib/server/observability/schema";

vi.mock("cloudflare:workers", () => ({ tracing: { enterSpan: vi.fn() } }));

const event = {
  event: "operation.completed",
  operation: "period.read",
  route: "/api/periods/[periodId]",
  method: "GET",
  outcome: "success",
  status: 200,
} satisfies TelemetryEvent;

function recordingNative() {
  const spans: { name: string; attributes: Record<string, string | number> }[] =
    [];
  const native: NativeTracing = {
    enterSpan(name, callback) {
      const attributes: Record<string, string | number> = {};
      spans.push({ name, attributes });
      return callback({
        setAttribute(key, value) {
          attributes[key] = value;
        },
      });
    },
  };
  return { native, spans };
}

afterEach(() => vi.restoreAllMocks());

describe.each([
  {
    name: "native-backed",
    create: () => createTracing(recordingNative().native),
  },
  { name: "no-op", create: () => noopTracing },
])("$name tracing callback contract", ({ create }) => {
  it("preserves the synchronous result and calls work once without a span handle", () => {
    const result = { privateResult: "secret-result" };
    const callback = vi.fn(() => result);

    const actual = create().withSpan("period.read", callback, event);

    expect(actual).toBe(result);
    expect(callback.mock.calls).toEqual([[]]);
  });

  it("preserves the Promise and its resolved value", async () => {
    const value = { privateResult: "secret-result" };
    const promise = Promise.resolve(value);
    const callback = vi.fn(() => promise);

    const actual = create().withSpan("period.read", callback);

    expect(actual).toBe(promise);
    await expect(actual).resolves.toBe(value);
    expect(callback.mock.calls).toEqual([[]]);
  });

  it("throws the original Error synchronously without logging it", () => {
    const error = new Error("private callback error");
    const callback = vi.fn(() => {
      throw error;
    });
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
    let caught: unknown;

    try {
      create().withSpan("period.read", callback);
    } catch (failure) {
      caught = failure;
    }

    expect(caught).toBe(error);
    expect(callback.mock.calls).toEqual([[]]);
    expect(consoleLog).not.toHaveBeenCalled();
  });

  it("preserves rejected Promise and Error identities without logging", async () => {
    const error = new Error("private rejection");
    const promise = Promise.reject(error);
    const callback = vi.fn(() => promise);
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

    const actual = create().withSpan("period.read", callback);

    expect(actual).toBe(promise);
    await expect(actual).rejects.toBe(error);
    expect(callback.mock.calls).toEqual([[]]);
    expect(consoleLog).not.toHaveBeenCalled();
  });

  it("executes work once even when an untyped caller provides an invalid name", () => {
    const result = { privateResult: "secret-result" };
    const callback = vi.fn(() => result);

    const actual = Reflect.apply(create().withSpan, undefined, [
      "/api/periods/secret-period",
      callback,
      event,
    ]);

    expect(actual).toBe(result);
    expect(callback.mock.calls).toEqual([[]]);
  });
});

describe("native span output boundary", () => {
  it("emits a static name and only sanitized attributes", () => {
    const { native, spans } = recordingNative();
    const attributes = {
      ...event,
      amount: 1234,
      periodId: "secret-period",
      date: "2026-09-13",
      error: new Error("private message and stack"),
      get body() {
        throw new Error("must not read extra attributes");
      },
    };

    createTracing(native).withSpan(
      "period.read",
      () => "private-result",
      attributes,
    );

    expect(spans).toEqual([{ name: "period.read", attributes: event }]);
  });

  it.each([
    undefined,
    { ...event, status: 600 },
    { ...event, operation: "period.list" as const },
  ])("omits absent, invalid or mismatched attributes: %j", (attributes) => {
    const { native, spans } = recordingNative();
    const callback = vi.fn(() => "result");

    const actual = createTracing(native).withSpan(
      "period.read",
      callback,
      attributes,
    );

    expect(actual).toBe("result");
    expect(callback.mock.calls).toEqual([[]]);
    expect(spans).toEqual([{ name: "period.read", attributes: {} }]);
  });

  it("never sends invalid names to native enterSpan", () => {
    const { native, spans } = recordingNative();

    Reflect.apply(createTracing(native).withSpan, undefined, [
      "secret-operation",
      () => "result",
    ]);

    expect(spans).toEqual([]);
  });

  it("smoke-imports the Workers entry with its native module mocked", async () => {
    const { tracing } = await import("cloudflare:workers");
    const setAttribute = vi.fn();
    vi.mocked(tracing.enterSpan).mockImplementation(
      (_name, callback, ...args) =>
        callback({ isTraced: true, setAttribute }, ...args),
    );
    const { workersTracing } =
      await import("$lib/server/observability/tracing-workers");
    const result = { privateResult: "secret-result" };
    const callback = vi.fn(() => result);

    const actual = workersTracing.withSpan("period.read", callback, event);

    expect(actual).toBe(result);
    expect(callback.mock.calls).toEqual([[]]);
    expect(tracing.enterSpan).toHaveBeenCalledExactlyOnceWith(
      "period.read",
      expect.any(Function),
    );
    expect(Object.fromEntries(setAttribute.mock.calls)).toEqual(event);
    expect(setAttribute).toHaveBeenCalledTimes(6);
  });
});
