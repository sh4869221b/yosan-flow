import { json, type RequestHandler } from "@sveltejs/kit";

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

  await db.batch([
    db.prepare("DELETE FROM daily_operation_histories"),
    db.prepare("DELETE FROM daily_totals"),
    db.prepare("DELETE FROM budget_periods"),
  ]);

  return json({ ok: true });
};
