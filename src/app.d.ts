import type { D1Database } from "$lib/server/db/d1-types";

declare global {
  namespace App {
    interface Platform {
      env: {
        DB: D1Database;
        YOSAN_FLOW_E2E_RESET_TOKEN?: string;
      };
      cf: unknown;
      ctx: {
        waitUntil(promise: Promise<unknown>): void;
        passThroughOnException?(): void;
      };
    }
  }
}

export {};
