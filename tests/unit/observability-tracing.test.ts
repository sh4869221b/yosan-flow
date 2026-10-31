import { cloudflareRuntime } from "../helpers/cloudflare-runtime";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createTracing,
  noopTracing,
  type NativeTracing,
} from "#lib/server/observability/tracing.ts";
import { CUSTOM_SPAN_NAMES } from "#lib/server/observability/span-schema.ts";

const attributes = {
  "app.operation": "summary.calculate",
  "app.route": "/api/periods/[periodId]",
} as const;

function recordingNative(isTraced = true) {
  const spans: { name: string; attributes: Record<string, string | number> }[] =
    [];
  const native: NativeTracing = {
    enterSpan(name, callback) {
      const attributes: Record<string, string | number> = {};
      spans.push({ name, attributes });
      return callback({
        isTraced,
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

    const actual = create().withSpan(
      "summary.calculate",
      callback,
      () => attributes,
    );

    expect(actual).toBe(result);
    expect(callback.mock.calls).toEqual([[]]);
  });

  it("preserves the Promise and its resolved value", async () => {
    const value = { privateResult: "secret-result" };
    const promise = Promise.resolve(value);
    const callback = vi.fn(() => promise);

    const actual = create().withSpan("summary.calculate", callback);

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
      create().withSpan("summary.calculate", callback);
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

    const actual = create().withSpan("summary.calculate", callback);

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
      () => attributes,
    ]);

    expect(actual).toBe(result);
    expect(callback.mock.calls).toEqual([[]]);
  });
});

describe("native span output boundary", () => {
  it.each(CUSTOM_SPAN_NAMES)("sanitizes sampled custom span %s", (name) => {
    const { native, spans } = recordingNative();
    const attributes = vi.fn(() => ({
      "app.operation": name,
      "app.route": "/api/periods" as const,
      amount: 1234,
      periodId: "private-period",
      date: "2026-09-13",
      error: new Error("private message and stack"),
      get body() {
        throw new Error("must not read private attributes");
      },
    }));
    createTracing(native).withSpan(name, () => "result", attributes);
    expect(attributes).toHaveBeenCalledOnce();
    expect(spans).toEqual([
      {
        name,
        attributes: { "app.operation": name, "app.route": "/api/periods" },
      },
    ]);
  });

  it.each([false, true])("skips lazy metadata with no-op=%s", (noop) => {
    const { native, spans } = recordingNative(false);
    const attributes = vi.fn(() => ({
      "app.operation": "summary.calculate" as const,
    }));
    const work = vi.fn(() => "result");
    const tracing = noop ? noopTracing : createTracing(native);
    expect(tracing.withSpan("summary.calculate", work, attributes)).toBe(
      "result",
    );
    expect(attributes).not.toHaveBeenCalled();
    expect(work.mock.calls).toEqual([[]]);
    expect(spans).toEqual(
      noop ? [] : [{ name: "summary.calculate", attributes: {} }],
    );
  });

  it.each([
    [{ "app.operation": "api.history.delete" }, {}],
    [
      {
        "app.operation": "summary.calculate",
        "app.route": "/api/periods/private-id",
      },
      { "app.operation": "summary.calculate" },
    ],
  ])("rejects custom mismatches and concrete routes: %j", (input, expected) => {
    const { native, spans } = recordingNative();
    Reflect.apply(createTracing(native).withSpan, undefined, [
      "summary.calculate",
      () => "result",
      () => input,
    ]);
    expect(spans).toEqual([
      { name: "summary.calculate", attributes: expected },
    ]);
  });

  it("supports sampled spans without optional attributes", () => {
    const { native, spans } = recordingNative();
    const callback = vi.fn(() => "result");
    const actual = createTracing(native).withSpan(
      "summary.calculate",
      callback,
    );
    expect(actual).toBe("result");
    expect(callback.mock.calls).toEqual([[]]);
    expect(spans).toEqual([{ name: "summary.calculate", attributes: {} }]);
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
    const setAttribute = vi.fn();
    const enterSpan = vi.fn();
    cloudflareRuntime.tracing = {
      enterSpan(name, callback) {
        enterSpan(name, callback);
        return callback({ isTraced: true, setAttribute });
      },
    };
    const { getRequestTracing } =
      await import("#lib/server/observability/tracing-workers.ts");
    const result = { privateResult: "secret-result" };
    const callback = vi.fn(() => result);

    const actual = getRequestTracing().withSpan(
      "summary.calculate",
      callback,
      () => attributes,
    );

    expect(actual).toBe(result);
    expect(callback.mock.calls).toEqual([[]]);
    expect(enterSpan).toHaveBeenCalledExactlyOnceWith(
      "summary.calculate",
      expect.any(Function),
    );
    expect(Object.fromEntries(setAttribute.mock.calls)).toEqual(attributes);
    expect(setAttribute).toHaveBeenCalledTimes(2);
  });
});
