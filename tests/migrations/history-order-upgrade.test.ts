import { expect, it } from "vitest";
import { createD1ApiServices } from "#lib/server/services/api-services/d1.ts";
import { runApiEffect } from "#lib/server/effect/runtime.ts";
import { applyMigrations, createMigrationDatabase } from "./database";
import { readMigrations } from "./history";
import { createSqliteD1 } from "./sqlite-d1";

it("backfills commit order and preserves already-replayed legacy history chains", async () => {
  const db = createMigrationDatabase();
  try {
    const migrations = readMigrations();
    applyMigrations(db, migrations.slice(0, -1));
    db.exec(`
      INSERT INTO budget_periods (id, start_date, end_date, budget_yen, created_at, updated_at)
        VALUES ('.', '2026-07-01', '2026-07-31', 1000, 'c', 'u'),
          ('..', '2026-08-01', '2026-08-31', 1000, 'c', 'u');
      UPDATE budget_periods SET predecessor_period_id = '.' WHERE id = '..';
      INSERT INTO daily_operation_histories (rowid, id, budget_period_id, date, operation_type,
        input_yen, before_total_yen, after_total_yen, memo, created_at) VALUES
        (3, 'overwrite', '.', '2026-07-01', 'overwrite', 100, 0, 100, NULL, 'later'),
        (17, 'add', '.', '2026-07-01', 'add', 30, 100, 130, NULL, 'earlier'),
        (21, 'old-overwrite', '..', '2026-08-01', 'overwrite', 100, 30, 100, NULL, 'later'),
        (50, 'old-add', '..', '2026-08-01', 'add', 30, 0, 30, NULL, 'earlier');
      INSERT INTO daily_totals VALUES
        ('.', '2026-07-01', '2026-07', 130, 'u'),
        ('..', '2026-08-01', '2026-08', 100, 'u');
    `);
    applyMigrations(db, migrations);
    expect(
      db
        .prepare(
          "SELECT rowid, id, write_order FROM daily_operation_histories ORDER BY rowid",
        )
        .all(),
    ).toEqual([
      { rowid: 3, id: "overwrite", write_order: -2 },
      { rowid: 17, id: "add", write_order: -1 },
      { rowid: 21, id: "old-overwrite", write_order: -1 },
      { rowid: 50, id: "old-add", write_order: -2 },
    ]);
    const services = createD1ApiServices(createSqliteD1(db));
    expect(
      await runApiEffect(services.budgetPeriodRepository.findById("..")),
    ).toMatchObject({
      predecessorPeriodId: ".",
    });
    await runApiEffect(
      services.dayEntryService.updateHistoryEntry({
        periodId: ".",
        date: "2026-07-01",
        historyId: "add",
        inputYen: 40,
      }),
    );
    await runApiEffect(
      services.dayEntryService.updateHistoryEntry({
        periodId: "..",
        date: "2026-08-01",
        historyId: "old-add",
        inputYen: 40,
      }),
    );
    expect(
      await runApiEffect(services.listDailyTotalsByPeriodId(".")),
    ).toMatchObject([{ totalUsedYen: 140 }]);
    expect(
      await runApiEffect(services.listDailyTotalsByPeriodId("..")),
    ).toMatchObject([{ totalUsedYen: 100 }]);
  } finally {
    db.close();
  }
});

it("keeps inserts from older and newer Workers in order during migration rollout", async () => {
  const db = createMigrationDatabase();
  try {
    const migrations = readMigrations();
    applyMigrations(db, migrations.slice(0, -1));
    db.exec(`
      INSERT INTO budget_periods (id, start_date, end_date, budget_yen, created_at, updated_at)
        VALUES ('rollout', '2026-07-01', '2026-07-31', 1000, 'c', 'u');
      INSERT INTO daily_totals VALUES ('rollout', '2026-07-01', '2026-07', 50, 'u');
      INSERT INTO daily_operation_histories (id, budget_period_id, date, operation_type,
        input_yen, before_total_yen, after_total_yen, created_at)
        VALUES ('legacy', 'rollout', '2026-07-01', 'add', 50, 0, 50, 'later');
    `);
    applyMigrations(db, migrations);
    const insertFromOldWorker = db.prepare(`
      INSERT INTO daily_operation_histories (id, budget_period_id, date, operation_type,
        input_yen, before_total_yen, after_total_yen, created_at)
        VALUES (?, 'rollout', '2026-07-01', ?, ?, ?, ?, 'earlier')
    `);
    const setTotalFromOldWorker = db.prepare(
      "UPDATE daily_totals SET total_used_yen = ?",
    );
    insertFromOldWorker.run("old-overwrite", "overwrite", 100, 50, 100);
    setTotalFromOldWorker.run(100);

    const services = createD1ApiServices(createSqliteD1(db), {
      createHistoryId: () => "new-add",
    });
    const day = { periodId: "rollout", date: "2026-07-01" };
    await runApiEffect(
      services.dayEntryService.addDailyAmount({ ...day, inputYen: 30 }),
    );
    insertFromOldWorker.run("old-add", "add", 20, 130, 150);
    setTotalFromOldWorker.run(150);

    await runApiEffect(
      services.dayEntryService.updateHistoryEntry({
        ...day,
        historyId: "new-add",
        inputYen: 35,
      }),
    );
    expect(
      await runApiEffect(services.listHistoryByDate(day.periodId, day.date)),
    ).toMatchObject([
      { id: "old-add", beforeTotalYen: 135, afterTotalYen: 155 },
      { id: "new-add", beforeTotalYen: 100, afterTotalYen: 135 },
      { id: "old-overwrite", beforeTotalYen: 50, afterTotalYen: 100 },
      { id: "legacy", beforeTotalYen: 0, afterTotalYen: 50 },
    ]);
    expect(
      await runApiEffect(services.listDailyTotalsByPeriodId(day.periodId)),
    ).toMatchObject([{ totalUsedYen: 155 }]);
  } finally {
    db.close();
  }
});
