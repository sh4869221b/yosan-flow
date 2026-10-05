import { beforeEach, vi } from "vitest";
import { cloudflareRuntime } from "./helpers/cloudflare-runtime";

vi.mock("cloudflare:workers", async () => {
  const { cloudflareRuntime } = await import("./helpers/cloudflare-runtime");
  return {
    get env() {
      return cloudflareRuntime.env;
    },
    get tracing() {
      return cloudflareRuntime.tracing;
    },
  };
});

vi.mock("$app/env", async () => {
  const { cloudflareRuntime } = await import("./helpers/cloudflare-runtime");
  return {
    get dev() {
      return cloudflareRuntime.dev;
    },
  };
});

beforeEach(() => {
  cloudflareRuntime.env = {};
  cloudflareRuntime.tracing = undefined;
  cloudflareRuntime.dev = false;
});
