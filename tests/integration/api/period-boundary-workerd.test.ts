import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  getPlatformProxy,
  unstable_splitSqlQuery,
  type PlatformProxy,
} from "wrangler";
import { createDrizzleD1Database } from "#lib/server/db/client.ts";
import type { D1Database } from "#lib/server/db/d1-types.ts";
import { updateD1LinkedPeriodBoundary } from "#lib/server/db/budget-period-boundary-d1.ts";
import type {
  BudgetPeriodRecord,
  LinkedPeriodBoundaryUpdateCommand,
} from "#lib/server/db/budget-period-types.ts";
import {
  budget_periods,
  daily_totals,
  daily_operation_histories,
} from "#lib/server/db/schema.ts";
import { readMigrations } from "../../migrations/history";
import {
  target,
  successor,
  laterBoundary,
  earlierBoundary,
  toD1Row,
} from "./period-boundary-sql-fixture";

// Uses the workerd bundled with the project's Wrangler, not the SQL-dispatch
// fake or Node's unrelated SQLite build. No remote bindings or persisted state.
describe("linked boundary in actual local D1", () => {
  let directory: string;
  let proxy: PlatformProxy<{ DB: D1Database }> | undefined;
  let database: ReturnType<typeof createDrizzleD1Database>;

  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), "yosan-boundary-d1-"));
    const configPath = join(directory, "wrangler.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        name: "boundary-sql-regression",
        compatibility_date: "2026-04-18",
        send_metrics: false,
        d1_databases: [
          {
            binding: "DB",
            database_name: "boundary-sql-regression",
            database_id: "00000000-0000-0000-0000-000000000000",
          },
        ],
      }),
    );
    proxy = await getPlatformProxy<{ DB: D1Database }>({
      configPath,
      envFiles: [],
      persist: false,
      remoteBindings: false,
    });
    for (const migration of readMigrations()) {
      for (const statement of unstable_splitSqlQuery(migration.sql)) {
        await proxy.env.DB.prepare(statement).run();
      }
    }
    database = createDrizzleD1Database(proxy.env.DB);
  }, 30_000);

  afterAll(async () => {
    try {
      await proxy?.dispose();
    } finally {
      if (directory) rmSync(directory, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    // This binding was created above solely for this suite and is never persisted.
    await database.batch([
      database.delete(daily_operation_histories),
      database.delete(daily_totals),
      database.delete(budget_periods),
    ]);
    await database
      .insert(budget_periods)
      .values([target, successor].map(toD1Row));
  });

  const state = async () => ({
    periods: await database
      .select()
      .from(budget_periods)
      .orderBy(budget_periods.id),
    totals: await database
      .select()
      .from(daily_totals)
      .orderBy(daily_totals.budget_period_id, daily_totals.date),
    histories: await database
      .select()
      .from(daily_operation_histories)
      .orderBy(daily_operation_histories.id),
  });

  async function expectConflict(command: LinkedPeriodBoundaryUpdateCommand) {
    const before = await state();
    await expect(
      updateD1LinkedPeriodBoundary(database, command),
    ).rejects.toMatchObject({ code: "PERIOD_UPDATE_CONFLICT" });
    expect(await state()).toEqual(before);
  }

  it.each([
    ["earlier", earlierBoundary],
    ["later", laterBoundary],
  ] as const)(
    "moves both boundaries %s and preserves every other field",
    async (_direction, command) => {
      const result = await updateD1LinkedPeriodBoundary(database, command);
      expect(result).toEqual({
        changedCount: 2,
        target: {
          ...target,
          ...command.target.after,
          updatedAt: command.nowIso,
        },
        successor: {
          ...successor,
          ...command.successor.after,
          updatedAt: command.nowIso,
        },
      });
      expect(await state()).toEqual({
        periods: [result.successor, result.target].map(toD1Row),
        totals: [],
        histories: [],
      });
      await expectConflict(command);
    },
  );

  it("accepts only one competing confirmation without partially updating either pair", async () => {
    const results = await Promise.allSettled([
      updateD1LinkedPeriodBoundary(database, earlierBoundary),
      updateD1LinkedPeriodBoundary(database, laterBoundary),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toMatchObject([{ reason: { code: "PERIOD_UPDATE_CONFLICT" } }]);
    const accepted = results.find((result) => result.status === "fulfilled");
    if (accepted?.status !== "fulfilled")
      throw new Error("missing accepted boundary");
    expect((await state()).periods).toEqual(
      [accepted.value.successor, accepted.value.target].map(toD1Row),
    );
  });

  const staleFields: Partial<BudgetPeriodRecord> = {
    id: "absent",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    budgetYen: 1,
    status: "active",
    predecessorPeriodId: "absent",
    createdAt: "stale-created",
    updatedAt: "stale-updated",
  };
  it.each(
    (["target", "successor"] as const).flatMap((side) =>
      (Object.keys(staleFields) as (keyof BudgetPeriodRecord)[]).map(
        (field) => ({ side, field }),
      ),
    ),
  )(
    "rejects a stale $side.$field snapshot without writes",
    async ({ side, field }) => {
      const before = laterBoundary[side].before;
      const changed =
        field === "status"
          ? before.status === "active"
            ? "closed"
            : "active"
          : staleFields[field];
      await expectConflict({
        ...laterBoundary,
        [side]: {
          ...laterBoundary[side],
          before: { ...before, [field]: changed },
        },
      });
    },
  );

  it.each(
    (["target", "successor"] as const).flatMap((side) =>
      (["startDate", "endDate"] as const).flatMap((field) =>
        ["2026-02-30", "2026-7-21", "not-a-date"].map((value) => ({
          side,
          field,
          value,
        })),
      ),
    ),
  )(
    "rejects noncanonical $side.$field = $value without writes",
    async ({ side, field, value }) => {
      await expectConflict({
        ...laterBoundary,
        [side]: {
          ...laterBoundary[side],
          after: { ...laterBoundary[side].after, [field]: value },
        },
      });
    },
  );

  it.each(["target", "successor"] as const)(
    "rejects a changed %s ID or negative budget",
    async (side) => {
      for (const after of [
        { ...laterBoundary[side].after, id: "different" },
        { ...laterBoundary[side].after, budgetYen: -1 },
        {
          ...laterBoundary[side].after,
          startDate: "2026-12-31",
          endDate: "2026-01-01",
        },
      ])
        await expectConflict({
          ...laterBoundary,
          [side]: { ...laterBoundary[side], after },
        });
    },
  );

  it("rejects noncontiguous proposed ranges", async () => {
    await expectConflict({
      ...laterBoundary,
      successor: {
        ...laterBoundary.successor,
        after: { ...laterBoundary.successor.after, startDate: "2026-07-23" },
      },
    });
  });

  it("rejects a newly overlapping third period", async () => {
    await database.insert(budget_periods).values(
      toD1Row({
        ...target,
        id: "third",
        startDate: "2026-07-21",
        endDate: "2026-07-21",
      }),
    );
    await expectConflict(laterBoundary);
  });

  it.each(["target", "successor"] as const)(
    "rejects expanding the %s across a legacy NULL-ID period",
    async (side) => {
      const date = side === "target" ? "2026-06-20" : "2026-08-20";
      // The immutable legacy TEXT PRIMARY KEY permits NULL even though the
      // canonical Drizzle schema models IDs as non-null.
      await database.insert(budget_periods).values({
        ...toD1Row(target),
        id: sql`null`,
        start_date: date,
        end_date: date,
      });
      await expectConflict({
        ...laterBoundary,
        [side]: {
          ...laterBoundary[side],
          after: {
            ...laterBoundary[side].after,
            [side === "target" ? "startDate" : "endDate"]: date,
          },
        },
      });
    },
  );

  it("rejects multiple linked successors", async () => {
    await database
      .insert(budget_periods)
      .values(toD1Row({ ...successor, id: "extra-successor" }));
    await expectConflict(laterBoundary);
  });

  it("preserves outer successors and rejects breaking their continuity", async () => {
    const outer = {
      ...successor,
      id: "outer",
      predecessorPeriodId: successor.id,
      startDate: "2026-08-20",
      endDate: "2026-09-19",
    };
    await database.insert(budget_periods).values(toD1Row(outer));
    await expectConflict({
      ...laterBoundary,
      successor: {
        ...laterBoundary.successor,
        after: { ...laterBoundary.successor.after, endDate: "2026-08-18" },
      },
    });
    await updateD1LinkedPeriodBoundary(database, laterBoundary);
    expect((await state()).periods.find(({ id }) => id === outer.id)).toEqual(
      toD1Row(outer),
    );
  });

  it("rejects unlinked or initially noncontiguous pairs even with current snapshots", async () => {
    for (const changedSuccessor of [
      { ...successor, predecessorPeriodId: null },
      { ...successor, startDate: "2026-07-22" },
    ]) {
      await database
        .update(budget_periods)
        .set(toD1Row(changedSuccessor))
        .where(eq(budget_periods.id, successor.id));
      await expectConflict({
        ...laterBoundary,
        successor: { ...laterBoundary.successor, before: changedSuccessor },
      });
    }
    await expectConflict({ ...laterBoundary, successor: laterBoundary.target });
  });

  it("checks the target's predecessor at write time without changing it", async () => {
    const predecessor = {
      ...target,
      id: "predecessor",
      startDate: "2026-05-21",
      endDate: "2026-06-20",
    };
    const linkedTarget = { ...target, predecessorPeriodId: predecessor.id };
    const command = {
      ...laterBoundary,
      target: { before: linkedTarget, after: laterBoundary.target.after },
    };
    await database.insert(budget_periods).values(toD1Row(predecessor));
    await database
      .update(budget_periods)
      .set({ predecessor_period_id: predecessor.id })
      .where(eq(budget_periods.id, target.id));
    await expectConflict({
      ...command,
      target: {
        ...command.target,
        after: { ...command.target.after, startDate: "2026-06-22" },
      },
    });
    await database
      .update(budget_periods)
      .set({ end_date: "2026-06-19" })
      .where(eq(budget_periods.id, predecessor.id));
    await expectConflict(command);
    await database
      .update(budget_periods)
      .set({ end_date: predecessor.endDate })
      .where(eq(budget_periods.id, predecessor.id));
    await updateD1LinkedPeriodBoundary(database, command);
    expect(
      (await state()).periods.find(({ id }) => id === predecessor.id),
    ).toEqual(toD1Row(predecessor));
  });

  it("binds quoted IDs and updates both budgets without changing links or status", async () => {
    await database.delete(budget_periods);
    const quotedTarget = { ...target, id: `target'"?--日本語` };
    const quotedSuccessor = {
      ...successor,
      id: `successor'"?--日本語`,
      predecessorPeriodId: quotedTarget.id,
    };
    await database
      .insert(budget_periods)
      .values([quotedTarget, quotedSuccessor].map(toD1Row));
    const command = {
      ...laterBoundary,
      target: {
        before: quotedTarget,
        after: { ...quotedTarget, endDate: "2026-07-21", budgetYen: 110_000 },
      },
      successor: {
        before: quotedSuccessor,
        after: {
          ...quotedSuccessor,
          startDate: "2026-07-22",
          budgetYen: 130_000,
        },
      },
    };
    const result = await updateD1LinkedPeriodBoundary(database, command);
    expect(result).toEqual({
      changedCount: 2,
      target: { ...command.target.after, updatedAt: command.nowIso },
      successor: { ...command.successor.after, updatedAt: command.nowIso },
    });
    expect((await state()).periods).toEqual(
      [result.successor, result.target].map(toD1Row),
    );
  });

  it("does not treat another period's same-date entries as displaced", async () => {
    const other = {
      ...target,
      id: "other",
      startDate: "2027-01-01",
      endDate: "2027-01-31",
    };
    await database.insert(budget_periods).values(toD1Row(other));
    await database.insert(daily_totals).values({
      budget_period_id: other.id,
      date: "2026-07-20",
      year_month: "2026-07",
      total_used_yen: 100,
      updated_at: laterBoundary.nowIso,
    });
    await database.insert(daily_operation_histories).values({
      id: "other-history",
      budget_period_id: other.id,
      date: "2026-07-20",
      operation_type: "add",
      input_yen: 100,
      before_total_yen: 0,
      after_total_yen: 100,
      memo: "他の期間",
      created_at: laterBoundary.nowIso,
    });
    const before = await state();
    await updateD1LinkedPeriodBoundary(database, earlierBoundary);
    const after = await state();
    expect(after.totals).toEqual(before.totals);
    expect(after.histories).toEqual(before.histories);
    expect(after.periods.find(({ id }) => id === other.id)).toEqual(
      toD1Row(other),
    );
  });

  it.each(["total", "history"] as const)(
    "rejects displaced %s on either period without moving any data",
    async (kind) => {
      for (const [period, command, date] of [
        [target, earlierBoundary, "2026-07-20"],
        [successor, laterBoundary, "2026-07-21"],
      ] as const) {
        if (kind === "total") {
          await database.insert(daily_totals).values({
            budget_period_id: period.id,
            date,
            year_month: "2026-07",
            total_used_yen: 100,
            updated_at: laterBoundary.nowIso,
          });
        } else {
          await database.insert(daily_operation_histories).values({
            id: period.id,
            budget_period_id: period.id,
            date,
            operation_type: "add",
            input_yen: 100,
            before_total_yen: 0,
            after_total_yen: 100,
            memo: "保存するメモ",
            created_at: laterBoundary.nowIso,
          });
        }
        await expectConflict(command);
      }
    },
  );
});
