import { AsyncLocalStorage } from "node:async_hooks";
import { Effect, Exit, Fiber } from "effect";
import { describe, expect, it, vi } from "vitest";
import { runApiEffect } from "$lib/server/effect/runtime";
import {
  createTracing,
  noopTracing,
  type NativeTracing,
} from "$lib/server/observability/tracing";
import { withTracingEffect } from "$lib/server/observability/tracing-effect";
import { getRequestTracing } from "$lib/server/observability/tracing-platform";

function recordingTracing() {
  const context = new AsyncLocalStorage<string>();
  const spans: {
    name: string;
    parent: string | undefined;
    pending: boolean;
  }[] = [];
  const native: NativeTracing = {
    enterSpan(name, callback) {
      const span = { name, parent: context.getStore(), pending: true };
      spans.push(span);
      return context.run(name, () => {
        const result = callback({ isTraced: true, setAttribute: vi.fn() });
        if (result instanceof Promise) {
          void result.finally(() => {
            span.pending = false;
          });
        } else {
          span.pending = false;
        }
        return result;
      });
    },
  };
  return { context, spans, native, tracing: createTracing(native) };
}

describe("request tracing Effect bridge", () => {
  it("is lazy and retains native parent context through asynchronous settlement", async () => {
    const { context, spans, tracing } = recordingTracing();
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const value = { result: "private-result" };
    const seen: (string | undefined)[] = [];
    const work = vi.fn(async () => {
      seen.push(context.getStore());
      started.resolve();
      await release.promise;
      seen.push(context.getStore());
      return value;
    });
    const effect = withTracingEffect(
      tracing,
      "summary.calculate",
      Effect.promise(work),
    );
    expect(spans).toEqual([]);
    expect(work).not.toHaveBeenCalled();
    const result = context.run("request-parent", () => runApiEffect(effect));
    await started.promise;
    expect(spans).toEqual([
      { name: "summary.calculate", parent: "request-parent", pending: true },
    ]);
    release.resolve();
    await expect(result).resolves.toBe(value);
    expect(work).toHaveBeenCalledOnce();
    expect(seen).toEqual(["summary.calculate", "summary.calculate"]);
    expect(spans[0]?.pending).toBe(false);
  });

  it("preserves the original typed failure through runApiEffect", async () => {
    const error = new Error("private failure");
    const { tracing } = recordingTracing();
    await expect(
      runApiEffect(
        withTracingEffect(tracing, "summary.calculate", Effect.fail(error)),
      ),
    ).rejects.toBe(error);
  });

  it("preserves the defect cause through Exit", async () => {
    const defect = new Error("private defect");
    const { tracing } = recordingTracing();
    const exit = await Effect.runPromiseExit(
      withTracingEffect(tracing, "summary.calculate", Effect.die(defect)),
    );
    expect(exit).toEqual(Exit.die(defect));
  });

  it("waits for interrupted work's asynchronous finalizer and closes its span", async () => {
    const { tracing, spans } = recordingTracing();
    const started = Promise.withResolvers<void>();
    const finalizing = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let active = false;
    const work = Effect.sync(() => {
      active = true;
      started.resolve();
    }).pipe(
      Effect.zipRight(Effect.never),
      Effect.ensuring(
        Effect.promise(async () => {
          finalizing.resolve();
          await release.promise;
          active = false;
        }),
      ),
    );
    const fiber = Effect.runFork(
      withTracingEffect(tracing, "summary.calculate", work),
    );
    await started.promise;
    let interrupted = false;
    const completion = Effect.runPromise(Fiber.interrupt(fiber)).then(
      (exit) => {
        interrupted = true;
        return exit;
      },
    );
    await finalizing.promise;
    expect(active).toBe(true);
    expect(interrupted).toBe(false);
    expect(spans[0]?.pending).toBe(true);
    release.resolve();
    expect(Exit.isInterrupted(await completion)).toBe(true);
    expect(active).toBe(false);
    expect(spans[0]?.pending).toBe(false);
  });

  it("uses native tracing from the invocation platform", async () => {
    const { native, spans } = recordingTracing();
    const platform = {
      ctx: { tracing: native, waitUntil() {} },
      cf: undefined,
      env: {},
    };
    const tracing = Reflect.apply(getRequestTracing, undefined, [platform]);
    await expect(
      runApiEffect(
        withTracingEffect(tracing, "summary.calculate", Effect.succeed(42)),
      ),
    ).resolves.toBe(42);
    expect(spans).toEqual([
      { name: "summary.calculate", parent: undefined, pending: false },
    ]);
  });

  it.each([undefined, { ctx: { waitUntil() {} } }, {}])(
    "missing native platform runs without metadata: %j",
    async (platform) => {
      const tracing = Reflect.apply(getRequestTracing, undefined, [platform]);
      const attributes = vi.fn(() => ({
        "app.operation": "summary.calculate" as const,
      }));
      expect(tracing).toBe(noopTracing);
      await expect(
        runApiEffect(
          withTracingEffect(
            tracing,
            "summary.calculate",
            Effect.succeed(42),
            attributes,
          ),
        ),
      ).resolves.toBe(42);
      expect(attributes).not.toHaveBeenCalled();
    },
  );
});
