import type { D1Database } from "$lib/server/db/d1-types";
import { runApiEffect } from "$lib/server/effect/runtime";
import type { PeriodBoundaryUpdateProposal } from "$lib/server/services/period-update/period-update-types";
import { GET as periodsGetDefaultRoute } from "../../../src/routes/api/periods/+server";
import { PUT as periodPutDefaultRoute } from "../../../src/routes/api/periods/[periodId]/+server";
import { createPeriodAwareD1Fake } from "../helpers/period-d1-fake";
import type { BudgetPeriodRow } from "../helpers/period-d1-fake-modules/types";
import { createFixture } from "./periods-fixture";

export const TARGET_ID = "period-target";
export const SUCCESSOR_ID = "period-successor";
export const NOW = new Date("2026-06-22T00:00:00.000Z");
export const UPDATE_REQUEST = {
  startDate: "2026-06-21",
  endDate: "2026-07-21",
  budgetYen: 110_000,
} as const;

export type JsonObject = Readonly<Record<string, unknown>>;
export type PreviewBody = {
  readonly error: JsonObject;
  readonly proposal: PeriodBoundaryUpdateProposal;
};

const targetRow: BudgetPeriodRow = {
  id: TARGET_ID,
  start_date: "2026-06-21",
  end_date: "2026-07-20",
  budget_yen: 100_000,
  status: "active",
  predecessor_period_id: null,
  created_at: NOW.toISOString(),
  updated_at: NOW.toISOString(),
};

const successorRow: BudgetPeriodRow = {
  id: SUCCESSOR_ID,
  start_date: "2026-07-21",
  end_date: "2026-08-19",
  budget_yen: 80_000,
  status: "active",
  predecessor_period_id: TARGET_ID,
  created_at: NOW.toISOString(),
  updated_at: NOW.toISOString(),
};

export async function seedLinkedPeriods(
  fixture: ReturnType<typeof createFixture>,
): Promise<void> {
  await runApiEffect(
    fixture.services.createPeriod({
      id: TARGET_ID,
      startDate: targetRow.start_date,
      endDate: targetRow.end_date,
      budgetYen: targetRow.budget_yen,
    }),
  );
  await runApiEffect(
    fixture.services.createPeriod({
      id: SUCCESSOR_ID,
      startDate: successorRow.start_date,
      endDate: successorRow.end_date,
      budgetYen: successorRow.budget_yen,
      predecessorPeriodId: TARGET_ID,
    }),
  );
}

export async function put(
  fixture: ReturnType<typeof createFixture>,
  body: JsonObject,
  periodId = TARGET_ID,
): Promise<Response> {
  return fixture.updatePeriod({
    params: { periodId },
    request: new Request(`http://localhost/api/periods/${periodId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  } as never);
}

export async function putRaw(
  fixture: ReturnType<typeof createFixture>,
  body: string,
): Promise<Response> {
  return fixture.updatePeriod({
    params: { periodId: TARGET_ID },
    request: new Request(`http://localhost/api/periods/${TARGET_ID}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body,
    }),
  } as never);
}

export async function readPeriods(
  fixture: ReturnType<typeof createFixture>,
): Promise<readonly JsonObject[]> {
  return runApiEffect(fixture.services.listPeriods());
}

export async function addSuccessorEntry(
  fixture: ReturnType<typeof createFixture>,
): Promise<Response> {
  return fixture.addDay({
    params: { periodId: SUCCESSOR_ID, date: "2026-07-21" },
    request: new Request(
      `http://localhost/api/periods/${SUCCESSOR_ID}/days/2026-07-21/add`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ inputYen: 100 }),
      },
    ),
  } as never);
}

export type D1BoundaryHarness = {
  readonly db: D1Database;
  readonly put: (body: JsonObject, periodId?: string) => Promise<Response>;
  readonly list: () => Promise<Response>;
};

export function createD1BoundaryHarness(input?: {
  readonly periods?: readonly BudgetPeriodRow[];
  readonly totalDates?: Readonly<Record<string, readonly string[]>>;
}): D1BoundaryHarness {
  const db = createPeriodAwareD1Fake([], {
    periods: input?.periods ?? [targetRow, successorRow],
    totalDates: input?.totalDates,
  });
  return {
    db,
    put: (body, periodId = TARGET_ID) =>
      Promise.resolve(
        periodPutDefaultRoute({
          params: { periodId },
          request: new Request(`http://localhost/api/periods/${periodId}`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }),
          platform: { env: { DB: db } },
        } as never),
      ),
    list: () =>
      Promise.resolve(
        periodsGetDefaultRoute({
          request: new Request("http://localhost/api/periods"),
          platform: { env: { DB: db } },
        } as never),
      ),
  };
}

export function createMultipleSuccessorRows(): readonly BudgetPeriodRow[] {
  return [
    targetRow,
    successorRow,
    {
      ...successorRow,
      id: "period-successor-two",
      start_date: "2026-07-22",
      end_date: "2026-08-20",
    },
  ];
}

export function createGapSuccessorRows(): readonly BudgetPeriodRow[] {
  return [{ ...targetRow, end_date: "2026-07-18" }, successorRow];
}
