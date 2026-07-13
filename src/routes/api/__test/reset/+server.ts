import { json, type RequestHandler } from "@sveltejs/kit";
import { count } from "drizzle-orm";
import { createDrizzleD1Database } from "$lib/server/db/client";
import {
  budget_periods,
  daily_operation_histories,
  daily_totals,
} from "$lib/server/db/schema";

const RESET_HEADER = "x-yosan-flow-e2e-reset-token";

type ResetCounts = {
  budgetPeriods: number;
  dailyOperationHistories: number;
  dailyTotals: number;
};

async function getResetCounts(
  database: ReturnType<typeof createDrizzleD1Database>,
): Promise<ResetCounts> {
  const [historyRows] = await database
    .select({ value: count() })
    .from(daily_operation_histories);
  const [dailyTotalRows] = await database
    .select({ value: count() })
    .from(daily_totals);
  const [periodRows] = await database
    .select({ value: count() })
    .from(budget_periods);
  return {
    budgetPeriods: periodRows.value,
    dailyOperationHistories: historyRows.value,
    dailyTotals: dailyTotalRows.value,
  };
}

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
  const startedAt = new Date().toISOString();
  const before = await getResetCounts(database);
  await database.delete(daily_operation_histories).run();
  await database.delete(daily_totals).run();
  await database.delete(budget_periods).run();
  const after = await getResetCounts(database);
  const completedAt = new Date().toISOString();

  console.info(
    JSON.stringify({
      after,
      before,
      completedAt,
      event: "e2e-database-reset",
      startedAt,
    }),
  );

  return json({ after, before, completedAt, ok: true, startedAt });
};
