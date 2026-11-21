import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import type { D1Database } from "#lib/server/db/d1-types.ts";
import { runApiEffect } from "#lib/server/effect/runtime.ts";
import { createD1ApiServices } from "#lib/server/services/api-services/d1.ts";
import { _createPeriodDayAddHandler } from "../../../src/routes/api/periods/[periodId]/days/[date]/add/+server";
import { _createPeriodDayOverwriteHandler } from "../../../src/routes/api/periods/[periodId]/days/[date]/overwrite/+server";
import { _createPeriodDayHistoryMutationHandler } from "../../../src/routes/api/periods/[periodId]/days/[date]/history/[historyId]/+server";
import {
  applyMigrations,
  createMigrationDatabase,
} from "../../migrations/database";
import { readMigrations } from "../../migrations/history";
import { createSqliteD1 } from "../../migrations/sqlite-d1";

const periodId = "period-1";
const date = "2026-11-15";
const now = new Date("2026-11-15T00:00:00.000Z");
const entry = { periodId, date, inputYen: 300, memo: "lunch" };

function holdNextBatch(db: D1Database) {
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const next: D1Database = {
    prepare: db.prepare.bind(db),
    exec: db.exec.bind(db),
    withSession: db.withSession.bind(db),
    dump: db.dump.bind(db),
    async batch(statements) {
      entered.resolve();
      await release.promise;
      return db.batch(statements);
    },
  };
  return { db: next, entered: entered.promise, release: release.resolve };
}

describe("day entry commit safety through the API and SQLite", () => {
  let sqlite: DatabaseSync;
  let db: D1Database;
  let services: ReturnType<typeof createD1ApiServices>;

  beforeEach(async () => {
    sqlite = createMigrationDatabase();
    applyMigrations(sqlite, readMigrations());
    db = createSqliteD1(sqlite);
    services = createD1ApiServices(db, { now: () => now });
    await runApiEffect(
      services.createPeriod({
        id: periodId,
        startDate: date,
        endDate: "2026-11-30",
        budgetYen: 10_000,
      }),
    );
  });

  afterEach(() => sqlite.close());

  it.each([
    ["POST", _createPeriodDayAddHandler],
    ["PUT", _createPeriodDayOverwriteHandler],
  ] as const)(
    "acknowledges a committed %s when the summary fails and deduplicates retries",
    async (method, createHandler) => {
      const epoch = await runApiEffect(services.getDayEntryEpoch());
      const call = (
        handler: ReturnType<typeof createHandler>,
        inputYen = 300,
      ) =>
        handler({
          params: { periodId, date },
          request: new Request("http://localhost/day-entry", {
            method,
            headers: {
              "content-type": "application/json",
              "idempotency-key": `${epoch}.receipt-1`,
            },
            body: JSON.stringify({ inputYen, memo: "  lunch " }),
          }),
        } as Parameters<typeof handler>[0]);
      const withFailedSummary = createHandler({
        services: {
          ...services,
          listDailyTotalsByPeriodId: () =>
            Effect.fail(new Error("summary unavailable")),
        },
      });
      const saved = await call(withFailedSummary);
      expect(saved.status).toBe(204);
      expect(await saved.text()).toBe("");

      const reloaded = createD1ApiServices(db, { now: () => now });
      const retry = createHandler({ services: reloaded });
      const results = await Promise.all([call(retry), call(retry)]);
      expect(results.map(({ status }) => status)).toEqual([200, 200]);
      const [history] = await runApiEffect(
        services.listHistoryByDate(periodId, date),
      );
      expect(
        await runApiEffect(services.listHistoryByDate(periodId, date)),
      ).toEqual([
        expect.objectContaining({
          inputYen: 300,
          beforeTotalYen: 0,
          afterTotalYen: 300,
          memo: "lunch",
        }),
      ]);
      await runApiEffect(
        services.dayEntryService.deleteHistoryEntry({
          periodId,
          date,
          historyId: history.id,
        }),
      );
      expect((await call(retry)).status).toBe(200);
      expect(
        await runApiEffect(services.listHistoryByDate(periodId, date)),
      ).toEqual([]);
      expect(
        await runApiEffect(services.listDailyTotalsByPeriodId(periodId)),
      ).toEqual([]);

      const conflict = await call(retry, 301);
      expect(conflict.status).toBe(409);
      expect(await conflict.json()).toMatchObject({
        error: { code: "DAY_ENTRY_KEY_CONFLICT" },
      });
    },
  );

  it("replays in commit order after the earlier request commits last", async () => {
    const batch = holdNextBatch(db);
    const older = createD1ApiServices(batch.db, {
      now: () => new Date(now.getTime() - 1000),
      createHistoryId: () => "older-add",
    });
    const newer = createD1ApiServices(db, {
      now: () => now,
      createHistoryId: () => "newer-overwrite",
    });
    const added = runApiEffect(
      older.dayEntryService.addDailyAmount({ ...entry, inputYen: 30 }),
    );
    await batch.entered;
    try {
      await runApiEffect(
        newer.dayEntryService.overwriteDailyAmount({ ...entry, inputYen: 100 }),
      );
    } finally {
      batch.release();
    }
    await added;
    const totals = () =>
      runApiEffect(services.listDailyTotalsByPeriodId(periodId));
    const expected = [{ budgetPeriodId: periodId, date, totalUsedYen: 130 }];
    expect(await totals()).toEqual(expected);
    await runApiEffect(
      services.dayEntryService.updateHistoryEntry({
        ...entry,
        historyId: "older-add",
        inputYen: 30,
        memo: "edited",
      }),
    );
    expect(await totals()).toEqual(expected);
    expect(
      await runApiEffect(services.listHistoryByDate(periodId, date)),
    ).toMatchObject([
      {
        id: "older-add",
        beforeTotalYen: 100,
        afterTotalYen: 130,
        memo: "edited",
      },
      { id: "newer-overwrite", beforeTotalYen: 0, afterTotalYen: 100 },
    ]);
    await runApiEffect(
      services.dayEntryService.updateHistoryEntry({
        ...entry,
        historyId: "older-add",
        inputYen: 35,
        memo: "edited again",
      }),
    );
    expect(await totals()).toEqual([
      { budgetPeriodId: periodId, date, totalUsedYen: 135 },
    ]);
  });

  it("returns 404 and preserves the remaining data when deletion wins before edit", async () => {
    await runApiEffect(services.dayEntryService.addDailyAmount(entry));
    await runApiEffect(
      services.dayEntryService.addDailyAmount({ ...entry, inputYen: 25 }),
    );
    const [target] = await runApiEffect(
      services.listHistoryByDate(periodId, date),
    );
    const issued = { periodId, date, historyId: target.id };
    const batch = holdNextBatch(db);
    const editor = _createPeriodDayHistoryMutationHandler({
      services: createD1ApiServices(batch.db, {
        now: () => new Date(now.getTime() + 1000),
      }),
    }).PATCH;
    const edited = editor({
      params: issued,
      request: new Request("http://localhost/history", {
        method: "PATCH",
        body: JSON.stringify({ inputYen: 777 }),
      }),
    } as Parameters<typeof editor>[0]);

    const totals = () => sqlite.prepare("SELECT * FROM daily_totals").all();
    await batch.entered;
    let afterDelete;
    try {
      await runApiEffect(services.dayEntryService.deleteHistoryEntry(issued));
      afterDelete = totals();
    } finally {
      batch.release();
    }
    const response = await edited;
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: "HISTORY_NOT_FOUND" },
    });
    expect(totals()).toEqual(afterDelete);
    expect(
      await runApiEffect(services.listHistoryByDate(periodId, date)),
    ).toMatchObject([{ inputYen: 300, beforeTotalYen: 0, afterTotalYen: 300 }]);
  });
});
