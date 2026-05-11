import { json, type RequestHandler } from "@sveltejs/kit";
import { createDrizzleD1Database } from "$lib/server/db/client";
import {
  budget_periods,
  daily_operation_histories,
  daily_totals,
} from "$lib/server/db/schema";

const RESET_HEADER = "x-yosan-flow-e2e-reset-token";

function getResetToken(): string | null {
  const runtimeProcess = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process;
  return runtimeProcess?.env?.YOSAN_FLOW_E2E_RESET_TOKEN ?? null;
}

export const POST: RequestHandler = async ({ platform, request }) => {
  const expectedToken =
    platform?.env?.YOSAN_FLOW_E2E_RESET_TOKEN ?? getResetToken();
  if (!expectedToken) {
    return new Response(null, { status: 404 });
  }
  if (request.headers.get(RESET_HEADER) !== expectedToken) {
    return json(
      { error: { code: "FORBIDDEN", message: "Forbidden" } },
      { status: 403 },
    );
  }

  const db = platform?.env?.DB;
  if (!db) {
    return json(
      { error: { code: "DB_NOT_AVAILABLE", message: "D1 DB is unavailable" } },
      { status: 500 },
    );
  }

  const database = createDrizzleD1Database(db);
  await database.delete(daily_operation_histories).run();
  await database.delete(daily_totals).run();
  await database.delete(budget_periods).run();

  return json({ ok: true });
};
