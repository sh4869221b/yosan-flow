/// <reference types="@cloudflare/workers-types" />

declare global {
  namespace App {
    interface Platform {
      env: {
        DB: D1Database;
      };
      cf: CfProperties;
      ctx: ExecutionContext;
    }
  }
}

export {};
