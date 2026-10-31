import { afterEach, describe, expect, it, vi } from "vitest";
import { getApiServices } from "#lib/server/services/month-summary-service.ts";
import { GET } from "../../../src/routes/api/periods/+server";
import { cloudflareRuntime } from "../../helpers/cloudflare-runtime";
import { createPeriodAwareD1Fake } from "../helpers/period-d1-fake";
import { createRouteEvent } from "./route-event-fixture";

afterEach(() => vi.unstubAllEnvs());

describe("Cloudflare runtime services", () => {
  it("caches by D1 binding identity across invocation env objects", () => {
    const firstDb = createPeriodAwareD1Fake();
    const secondDb = createPeriodAwareD1Fake();
    cloudflareRuntime.env = { DB: firstDb };
    const first = getApiServices();
    cloudflareRuntime.env = { DB: secondDb };
    const second = getApiServices();
    expect(second).not.toBe(first);
    cloudflareRuntime.env = { DB: firstDb };
    expect(getApiServices()).toBe(first);
  });

  it("fails closed without DB even when no platform is supplied", async () => {
    await expect(
      GET(
        createRouteEvent({
          params: {},
          request: new Request("http://localhost/api/periods"),
        }),
      ),
    ).rejects.toThrow("D1 binding DB is required");
  });

  it.each([false, true])(
    "requires an explicit development flag (dev=%s)",
    (dev) => {
      cloudflareRuntime.dev = dev;
      vi.stubEnv("YOSAN_FLOW_FORCE_IN_MEMORY_DEV", "0");
      cloudflareRuntime.env = { YOSAN_FLOW_FORCE_IN_MEMORY_DEV: "0" };
      expect(getApiServices).toThrow("D1 binding DB is required");
    },
  );

  it("ignores leaked memory flags in a built Worker", () => {
    vi.stubEnv("YOSAN_FLOW_FORCE_IN_MEMORY_DEV", "1");
    cloudflareRuntime.env = { YOSAN_FLOW_FORCE_IN_MEMORY_DEV: "1" };
    expect(getApiServices).toThrow("D1 binding DB is required");
    cloudflareRuntime.env.DB = createPeriodAwareD1Fake();
    expect(getApiServices()).toBe(getApiServices());
  });

  it("shares explicit local in-memory services without reusing the D1 cache", () => {
    const db = createPeriodAwareD1Fake();
    cloudflareRuntime.env = { DB: db };
    const d1Services = getApiServices();
    cloudflareRuntime.dev = true;
    vi.stubEnv("YOSAN_FLOW_FORCE_IN_MEMORY_DEV", "1");
    const inMemoryServices = getApiServices();
    expect(inMemoryServices).not.toBe(d1Services);
    // The shell override is checked before even reading the D1 proxy.
    cloudflareRuntime.env = new Proxy(
      {},
      {
        get() {
          throw new Error("unavailable local proxy");
        },
      },
    );
    expect(getApiServices()).toBe(inMemoryServices);
    vi.stubEnv("YOSAN_FLOW_FORCE_IN_MEMORY_DEV", "0");
    cloudflareRuntime.env = { YOSAN_FLOW_FORCE_IN_MEMORY_DEV: "1" };
    expect(getApiServices()).toBe(inMemoryServices);
    cloudflareRuntime.env = { DB: db };
    expect(getApiServices()).toBe(d1Services);
  });
});
