import type { NativeTracing } from "#lib/server/observability/tracing.ts";

// Vitest isolates test files. The setup hook resets this explicit runtime seam
// before every test; handler factories can still inject their own services.
export const cloudflareRuntime: {
  env: Partial<Cloudflare.Env>;
  tracing: NativeTracing | undefined;
  dev: boolean;
} = {
  env: {},
  tracing: undefined,
  dev: false,
};
