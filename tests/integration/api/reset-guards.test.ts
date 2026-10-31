import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../../../src/routes/api/__test/reset/+server";
import { cloudflareRuntime } from "../../helpers/cloudflare-runtime";
import { createPeriodAwareD1Fake } from "../helpers/period-d1-fake";
import { createRouteEvent } from "./route-event-fixture";

const header = "x-yosan-flow-e2e-reset-token";

function reset(token?: string) {
  return POST(
    createRouteEvent({
      params: {},
      request: new Request("http://127.0.0.1/api/__test/reset", {
        method: "POST",
        headers: token ? { [header]: token } : {},
      }),
    }),
  );
}

afterEach(() => vi.unstubAllEnvs());

describe("local E2E reset runtime guards", () => {
  it("is unavailable without an explicitly configured local test token", async () => {
    vi.stubEnv("YOSAN_FLOW_E2E_RESET_TOKEN", undefined);
    const queries: string[] = [];
    cloudflareRuntime.env = { DB: createPeriodAwareD1Fake(queries) };
    expect((await reset("unconfigured-token")).status).toBe(404);
    expect(queries).toEqual([]);
  });

  it.each([undefined, "wrong-token", "shell-token"])(
    "rejects a missing or wrong token before querying DB: %s",
    async (token) => {
      vi.stubEnv("YOSAN_FLOW_E2E_RESET_TOKEN", "shell-token");
      const queries: string[] = [];
      cloudflareRuntime.env = {
        DB: createPeriodAwareD1Fake(queries),
        YOSAN_FLOW_E2E_RESET_TOKEN: "binding-token",
      };
      const response = await reset(token);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: { code: "FORBIDDEN", message: "Forbidden" },
      });
      expect(queries).toEqual([]);
    },
  );

  it("requires DB after validating the configured token", async () => {
    cloudflareRuntime.env = { YOSAN_FLOW_E2E_RESET_TOKEN: "binding-token" };
    const response = await reset("binding-token");
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: "DB_NOT_AVAILABLE", message: "D1 DB is unavailable" },
    });
  });

  it("preserves the explicitly configured local process token fallback", async () => {
    vi.stubEnv("YOSAN_FLOW_E2E_RESET_TOKEN", "shell-token");
    expect((await reset("shell-token")).status).toBe(500);
  });
});
