import "../worker-runtime.d.ts";
import type { D1Database } from "#lib/server/db/d1-types.ts";

declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      YOSAN_FLOW_E2E_RESET_TOKEN?: string;
      YOSAN_FLOW_FORCE_IN_MEMORY_DEV?: string;
    }
  }
}

export {};
