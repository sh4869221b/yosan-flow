import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createD1BudgetPeriodRepository } from "#lib/server/db/budget-period-d1-repository.ts";
import type {
  D1Database,
  D1PreparedStatement,
} from "#lib/server/db/d1-types.ts";
import { runApiEffect } from "#lib/server/effect/runtime.ts";
import {
  applyMigrations,
  createMigrationDatabase,
} from "../migrations/database";
import { readMigrations } from "../migrations/history";
import { createSqliteD1 } from "../migrations/sqlite-d1";

const nowIso = "2026-07-01T00:00:00.000Z";
const input = {
  id: "target",
  startDate: "2026-07-01",
  endDate: "2026-07-31",
  budgetYen: 1000,
  nowIso,
};

function period(
  db: DatabaseSync,
  id: string,
  startDate: string,
  endDate: string,
  predecessorId: string | null = null,
) {
  db.prepare(
    `INSERT INTO budget_periods
      (id, start_date, end_date, budget_yen, status,
        predecessor_period_id, created_at, updated_at)
      VALUES (?, ?, ?, 1000, 'active', ?, ?, ?)`,
  ).run(id, startDate, endDate, predecessorId, nowIso, nowIso);
}

function state(db: DatabaseSync) {
  return ["budget_periods", "daily_totals", "daily_operation_histories"].map(
    (table) => db.prepare(`SELECT rowid, * FROM ${table} ORDER BY rowid`).all(),
  );
}

// Execute the real generated SQL unchanged. Only inject another committed write
// after all repository preflight reads and immediately before its final DML.
function beforeWrite(d1: D1Database, inject: () => void): D1Database {
  let pending = true;
  function wrap(
    statement: D1PreparedStatement,
    query: string,
  ): D1PreparedStatement {
    return new Proxy(statement, {
      get(target, key, receiver) {
        if (key === "bind") {
          return (...values: unknown[]) => wrap(target.bind(...values), query);
        }
        if (key === "run" || key === "all" || key === "raw") {
          return (...args: unknown[]) => {
            if (
              pending &&
              /\b(?:insert into|update)\s+"?budget_periods"?\b/i.test(query)
            ) {
              pending = false;
              inject();
            }
            return Reflect.apply(Reflect.get(target, key), target, args);
          };
        }
        return Reflect.get(target, key, receiver);
      },
    });
  }
  return new Proxy(d1, {
    get(target, key) {
      if (key === "prepare") {
        return (query: string) => wrap(target.prepare(query), query);
      }
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

describe("ordinary period writes against concurrent SQLite changes", () => {
  let db: DatabaseSync;
  beforeEach(() => {
    db = createMigrationDatabase();
    applyMigrations(db, readMigrations());
  });
  afterEach(() => db.close());

  async function rejectsInjectedWrite(
    kind: "create" | "update",
    values: typeof input & { predecessorPeriodId?: string },
    inject: () => void,
    validationCode: string,
  ) {
    let injectedState: ReturnType<typeof state> | undefined;
    const repository = createD1BudgetPeriodRepository({
      db: beforeWrite(createSqliteD1(db), () => {
        inject();
        injectedState = state(db);
      }),
    });
    const operation =
      kind === "create"
        ? repository.createPeriod(values)
        : repository.updatePeriod(values);
    const result = await Promise.allSettled([runApiEffect(operation)]);
    expect(injectedState).toBeDefined();
    expect(result[0].status).toBe("rejected");
    if (result[0].status === "rejected") {
      expect([validationCode, "PERIOD_UPDATE_CONFLICT"]).toContain(
        result[0].reason.code,
      );
    }
    expect(state(db)).toEqual(injectedState);
  }

  it("allows only one of two overlapping concurrent creates", async () => {
    const repository = createD1BudgetPeriodRepository({
      db: createSqliteD1(db),
    });
    const result = await Promise.allSettled(
      ["first", "second"].map((id) =>
        runApiEffect(repository.createPeriod({ ...input, id })),
      ),
    );
    expect(result.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1,
    );
    const failure = result.find(({ status }) => status === "rejected");
    expect(failure?.status).toBe("rejected");
    if (failure?.status === "rejected") {
      expect(["PERIOD_OVERLAP", "PERIOD_UPDATE_CONFLICT"]).toContain(
        failure.reason.code,
      );
    }
    expect(db.prepare("SELECT * FROM budget_periods").all()).toHaveLength(1);
  });

  it("keeps concurrent same-ID creation idempotent", async () => {
    const repository = createD1BudgetPeriodRepository({
      db: createSqliteD1(db),
    });
    const records = await Promise.all(
      [1000, 2000].map((budgetYen) =>
        runApiEffect(repository.createPeriod({ ...input, budgetYen })),
      ),
    );
    expect(records[0]).toEqual(records[1]);
    expect(db.prepare("SELECT * FROM budget_periods").all()).toHaveLength(1);
  });

  it("rejects an overlap inserted after create preflight", async () => {
    await rejectsInjectedWrite(
      "create",
      input,
      () => period(db, "racer", "2026-07-15", "2026-08-10"),
      "PERIOD_OVERLAP",
    );
  });

  it.each(["changed", "missing"])(
    "rejects a %s predecessor after create preflight",
    async (change) => {
      period(db, "previous", "2026-06-01", "2026-06-30");
      await rejectsInjectedWrite(
        "create",
        { ...input, predecessorPeriodId: "previous" },
        () => {
          db.exec(
            change === "changed"
              ? "UPDATE budget_periods SET end_date = '2026-06-29' WHERE id = 'previous'"
              : "DELETE FROM budget_periods WHERE id = 'previous'",
          );
        },
        change === "changed"
          ? "PERIOD_CONTINUITY_VIOLATION"
          : "PERIOD_PREDECESSOR_NOT_FOUND",
      );
    },
  );

  it("rejects an overlap inserted after update preflight", async () => {
    period(db, input.id, input.startDate, "2026-07-10");
    await rejectsInjectedWrite(
      "update",
      { ...input, endDate: "2026-07-20" },
      () => period(db, "racer", "2026-07-15", "2026-07-25"),
      "PERIOD_OVERLAP",
    );
  });

  it("checks current predecessor continuity at update time", async () => {
    period(db, "previous", "2026-06-01", "2026-06-30");
    period(db, input.id, input.startDate, input.endDate, "previous");
    await rejectsInjectedWrite(
      "update",
      { ...input, budgetYen: 2000 },
      () =>
        db.exec(
          "UPDATE budget_periods SET end_date = '2026-06-29' WHERE id = 'previous'",
        ),
      "PERIOD_CONTINUITY_VIOLATION",
    );
  });

  it("rejects a successor linked after update preflight", async () => {
    period(db, input.id, input.startDate, input.endDate);
    await rejectsInjectedWrite(
      "update",
      { ...input, endDate: "2026-07-20" },
      () => period(db, "next", "2026-08-01", "2026-08-31", input.id),
      "PERIOD_CONTINUITY_VIOLATION",
    );
  });

  it.each(["total", "history"])(
    "rejects a new displaced %s at update time",
    async (kind) => {
      period(db, input.id, input.startDate, input.endDate);
      await rejectsInjectedWrite(
        "update",
        { ...input, endDate: "2026-07-20" },
        () => {
          db.exec(
            kind === "total"
              ? `INSERT INTO daily_totals VALUES
                  ('target', '2026-07-25', '2026-07', 10, '${nowIso}')`
              : `INSERT INTO daily_operation_histories VALUES
                  ('late-history', 'target', '2026-07-25', 'add', 10,
                    0, 10, '保持するメモ', '${nowIso}')`,
          );
        },
        "PERIOD_HAS_OUT_OF_RANGE_ENTRIES",
      );
    },
  );

  it("still creates and updates an uncontested ordinary period", async () => {
    const repository = createD1BudgetPeriodRepository({
      db: createSqliteD1(db),
    });
    await runApiEffect(repository.createPeriod(input));
    const updated = await runApiEffect(
      repository.updatePeriod({
        ...input,
        endDate: "2026-07-20",
        budgetYen: 2000,
        nowIso: "2026-07-02T00:00:00.000Z",
      }),
    );
    expect(updated).toMatchObject({
      id: input.id,
      endDate: "2026-07-20",
      budgetYen: 2000,
      createdAt: nowIso,
      updatedAt: "2026-07-02T00:00:00.000Z",
    });
  });
});
