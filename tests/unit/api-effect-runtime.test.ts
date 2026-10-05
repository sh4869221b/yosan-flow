import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { runApiEffect } from "$lib/server/effect/runtime";
import { ApiRouteError } from "$lib/server/validation/month";

describe("API Effect execution boundary", () => {
  it("returns the original success value", async () => {
    const value = { status: "ready" };
    await expect(runApiEffect(Effect.succeed(value))).resolves.toBe(value);
  });

  it("rejects with the original typed route error", async () => {
    const error = new ApiRouteError(409, "CONFLICT", "競合しています。");
    await expect(runApiEffect(Effect.fail(error))).rejects.toBe(error);
  });

  it("does not turn defects into successful results", async () => {
    const defect = new Error("unexpected failure");
    await expect(runApiEffect(Effect.die(defect))).rejects.toBe(defect);
  });

  it("does not turn interruption into a successful result", async () => {
    await expect(runApiEffect(Effect.interrupt)).rejects.toBeDefined();
  });
});
