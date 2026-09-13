import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiRouteError } from "$lib/server/validation/month";
import {
  observeMutationInitialization,
  runMutationResponse,
} from "$lib/server/observability/mutation-response";

afterEach(() => vi.restoreAllMocks());

describe("mutation terminal boundary", () => {
  it("returns the same readable response and emits once after the action finishes", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const response = new Response("private body", {
      status: 201,
      headers: { "x-response": "kept" },
    });
    const pending = Promise.withResolvers<void>();
    const result = runMutationResponse("period.create", async () => {
      await pending.promise;
      return { response };
    });
    expect(log).not.toHaveBeenCalled();
    pending.resolve();

    expect(await result).toBe(response);
    expect(response.headers.get("x-response")).toBe("kept");
    expect(await response.text()).toBe("private body");
    expect(log.mock.calls).toEqual([
      [
        {
          event: "operation.completed",
          operation: "period.create",
          route: "/api/periods",
          method: "POST",
          outcome: "success",
          status: 201,
        },
      ],
    ]);
  });

  it("maps a failure without copying its private code into the log", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const response = await runMutationResponse("day.add", async () => {
      throw new ApiRouteError(400, "private-code", "private message");
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "private-code", message: "private message" },
    });
    expect(log.mock.calls).toEqual([
      [
        {
          event: "operation.completed",
          operation: "day.add",
          route: "/api/periods/[periodId]/days/[date]/add",
          method: "POST",
          outcome: "validation",
          error_code: "UNKNOWN_ERROR",
          status: 400,
        },
      ],
    ]);
  });

  it("keeps simultaneous linked operations local to their request", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const pending = Promise.withResolvers<void>();
    const proposal = new Response("private proposal", { status: 409 });
    const first = runMutationResponse("period.update", async (context) => {
      context.operation = "period.boundary.propose";
      await pending.promise;
      return {
        response: proposal,
        errorCode: "PERIOD_BOUNDARY_CONFIRMATION_REQUIRED",
      };
    });
    await runMutationResponse("period.update", async (context) => {
      context.operation = "period.boundary.confirm";
      return { response: new Response("confirmed") };
    });
    pending.resolve();
    expect(await first).toBe(proposal);
    expect(await proposal.text()).toBe("private proposal");
    expect(log.mock.calls).toEqual([
      [
        {
          event: "operation.completed",
          operation: "period.boundary.confirm",
          route: "/api/periods/[periodId]",
          method: "PUT",
          outcome: "success",
          status: 200,
        },
      ],
      [
        {
          event: "operation.completed",
          operation: "period.boundary.propose",
          route: "/api/periods/[periodId]",
          method: "PUT",
          outcome: "conflict",
          error_code: "PERIOD_BOUNDARY_CONFIRMATION_REQUIRED",
          status: 409,
        },
      ],
    ]);
  });

  it("propagates sink failure without attempting a second event", async () => {
    const error = new Error("sink failed");
    const log = vi.spyOn(console, "log").mockImplementation(() => {
      throw error;
    });
    await expect(
      runMutationResponse("period.create", async () => ({
        response: new Response("ok"),
      })),
    ).rejects.toBe(error);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("does not log successful initialization and preserves failures over sink errors", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const services = {};
    expect(observeMutationInitialization("period.create", () => services)).toBe(
      services,
    );
    expect(log).not.toHaveBeenCalled();
    const original = new Error("private initialization failure");
    const initialize = () => {
      throw original;
    };
    await expect(
      Promise.resolve().then(() =>
        observeMutationInitialization("period.create", initialize),
      ),
    ).rejects.toBe(original);
    expect(log.mock.calls).toEqual([
      [
        {
          event: "operation.completed",
          operation: "period.create",
          route: "/api/periods",
          method: "POST",
          outcome: "unexpected_error",
          error_code: "INTERNAL_ERROR",
          status: 500,
        },
      ],
    ]);
    log.mockClear().mockImplementation(() => {
      throw new Error("sink failed");
    });
    await expect(
      Promise.resolve().then(() =>
        observeMutationInitialization("period.create", initialize),
      ),
    ).rejects.toBe(original);
    expect(log).toHaveBeenCalledTimes(1);
  });
});
