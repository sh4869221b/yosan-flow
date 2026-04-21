import type { D1Database } from "$lib/server/db/d1-types";

declare global {
  namespace App {
    interface Platform {
      env: {
        DB: D1Database;
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
