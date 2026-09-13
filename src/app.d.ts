import "../worker-runtime.d.ts";
import type { D1Database } from "$lib/server/db/d1-types";
import type { NativeTracing } from "$lib/server/observability/tracing";

declare global {
  namespace App {
    interface Platform {
      env: {
        DB: D1Database;
        YOSAN_FLOW_E2E_RESET_TOKEN?: string;
      };
      cf: unknown;
      ctx: {
        tracing?: NativeTracing;
        waitUntil(promise: Promise<unknown>): void;
        passThroughOnException?(): void;
      };
    }
  }
}

export {};
