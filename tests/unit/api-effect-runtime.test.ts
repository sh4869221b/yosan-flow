import { Cause, Effect } from "effect";
import { describe, expect, it } from "vitest";
import { runApiEffect } from "#lib/server/effect/runtime.ts";
import { ApiRouteError } from "#lib/server/validation/month.ts";
import { toApiErrorResponseResult } from "#lib/server/effect/result.ts";
import { withTracingEffect } from "#lib/server/observability/tracing-effect.ts";
import { noopTracing } from "#lib/server/observability/tracing.ts";

describe("API Effect execution boundary", () => {
  it("rejects with the original typed route error", async () => {
    const error = new ApiRouteError(409, "CONFLICT", "競合しています。");
    await expect(runApiEffect(Effect.fail(error))).rejects.toBe(error);
  });

  it.each([false, true])(
    "retains typed failures after successful cleanup (traced: %s)",
    async (traced) => {
      const error = new ApiRouteError(409, "CONFLICT", "競合しています。");
      const work = Effect.fail(error).pipe(Effect.ensuring(Effect.void));
      await expect(
        runApiEffect(
          traced
            ? withTracingEffect(noopTracing, "summary.calculate", work)
            : work,
        ),
      ).rejects.toBe(error);
      expect(toApiErrorResponseResult(error).status).toBe(409);
    },
  );

  it.each([false, true])(
    "preserves abnormal causes and maps them to 500 (traced: %s)",
    async (traced) => {
      const error = new ApiRouteError(409, "CONFLICT", "競合しています。");
      // A defect that resembles a domain error must still be an internal failure.
      const defect = new Error("PERIOD_NOT_FOUND private finalizer defect");
      const cases = [
        { work: Effect.die(error), cause: Cause.die(error) },
        {
          work: Effect.fail(error).pipe(Effect.ensuring(Effect.die(defect))),
          cause: Cause.combine(Cause.die(error), Cause.die(defect)),
        },
        {
          work: Effect.succeed("value").pipe(
            Effect.ensuring(Effect.die(defect)),
          ),
          cause: Cause.die(defect),
        },
        {
          work: Effect.failCause(Cause.interrupt(123)),
          cause: Cause.interrupt(123),
        },
        {
          work: Effect.failCause(Cause.interrupt(123)).pipe(
            Effect.ensuring(Effect.die(defect)),
          ),
          cause: Cause.combine(Cause.interrupt(123), Cause.die(defect)),
        },
      ];
      for (const { work, cause } of cases) {
        const failure = await runApiEffect(
          traced
            ? withTracingEffect(noopTracing, "summary.calculate", work)
            : work,
        ).then(
          () => {
            throw new Error("Expected rejection");
          },
          (failure: unknown) => failure,
        );
        expect(failure).toBeInstanceOf(Error);
        expect((failure as Error).cause).toEqual(cause);
        expect(toApiErrorResponseResult(failure)).toEqual({
          status: 500,
          body: {
            error: {
              code: "INTERNAL_ERROR",
              message: "サーバーエラーが発生しました。",
            },
          },
        });
      }
    },
  );
});
