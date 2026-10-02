import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import config from "../../drizzle.config";
import journal from "../../migrations/meta/_journal.json";
import snapshot from "../../migrations/meta/20261002021516_snapshot.json";

const legacyFiles = ["0001_initial.sql", "0002_reset_to_budget_periods.sql"];
const baselineName = "20261002021516_legacy_baseline";
const migration = (name: string) =>
  readFileSync(new URL(`../../migrations/${name}`, import.meta.url), "utf8");
const baseline = migration(`${baselineName}.sql`);
const tables = ["budget_periods", "daily_totals", "daily_operation_histories"];

function legacyDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const name of legacyFiles) db.exec(migration(name));
  return db;
}

function inspect(db: DatabaseSync) {
  return {
    schema: db
      .prepare(
        "SELECT type, name, tbl_name, sql FROM sqlite_schema ORDER BY name",
      )
      .all(),
    rows: tables.map((table) =>
      db.prepare(`SELECT rowid, * FROM ${table} ORDER BY rowid`).all(),
    ),
    keys: tables.map((table) => ({
      columns: db.prepare(`PRAGMA table_info('${table}')`).all(),
      foreignKeys: db.prepare(`PRAGMA foreign_key_list('${table}')`).all(),
      indexes: db.prepare(`PRAGMA index_list('${table}')`).all(),
    })),
  };
}

function seed(db: DatabaseSync) {
  db.exec(`
    INSERT INTO budget_periods VALUES
      ('period-a', '2026-09-01', '2026-09-30', 30000, 'closed', NULL, 'created-a', 'updated-a'),
      ('period-b', '2026-10-01', '2026-10-31', 45000, 'active', 'period-a', 'created-b', 'updated-b'),
      (NULL, '2026-11-01', '2026-11-30', 0, 'active', NULL, 'legacy-null', 'legacy-null');
    INSERT INTO daily_totals VALUES
      ('period-a', '2026-09-30', '2026-09', 350, 'updated-total-a'),
      ('period-b', '2026-09-30', '2026-09', 125, 'updated-total-b');
    INSERT INTO daily_operation_histories VALUES
      ('history-a', 'period-a', '2026-09-30', 'add', 350, 0, 350, '保持するメモ', 'same-time'),
      ('history-b', 'period-b', '2026-09-30', 'overwrite', 125, 0, 125, NULL, 'same-time'),
      (NULL, 'period-b', '2026-09-30', 'add', 0, 125, 125, 'legacy-null-id', 'same-time');
  `);
}

function expectConstraints(db: DatabaseSync) {
  expect(() =>
    db.exec("INSERT INTO daily_totals SELECT * FROM daily_totals LIMIT 1"),
  ).toThrow(/UNIQUE constraint failed/);
  expect(() =>
    db.exec(
      "UPDATE daily_totals SET budget_period_id = 'missing' WHERE rowid = 1",
    ),
  ).toThrow(/FOREIGN KEY constraint failed/);
  expect(() =>
    db.exec("UPDATE daily_operation_histories SET input_yen = -1"),
  ).toThrow(/CHECK constraint failed/);
  expect(() =>
    db.exec("UPDATE budget_periods SET predecessor_period_id = 'missing'"),
  ).toThrow(/FOREIGN KEY constraint failed/);
  expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  expect(db.prepare("PRAGMA integrity_check").get()).toEqual({
    integrity_check: "ok",
  });
}

describe("immutable Drizzle adoption baseline", () => {
  it("preserves the exact legacy SQL bytes", () => {
    expect(
      legacyFiles.map((name) =>
        createHash("sha256").update(migration(name)).digest("hex"),
      ),
    ).toEqual([
      "306e8f05e1346664f720166ec51ce53f52ba4ace5b493920cecf3ec5013a0486",
      "ed8e1ef66c057c07c8eb02627e335549778a73c13b974403e0def7fcf42fb511",
    ]);
  });

  it("starts Drizzle metadata after the legacy filenames without claiming them", () => {
    expect(config.out).toBe("./migrations");
    expect(config.migrations?.prefix).toBe("timestamp");
    expect(journal.entries[0]).toMatchObject({ idx: 0, tag: baselineName });
    expect(journal.entries.some(({ tag }) => /^000[12]_/.test(tag))).toBe(
      false,
    );
    expect(Number.parseInt(baselineName, 10)).toBeGreaterThan(2);
    expect(snapshot.prevId).toBe("00000000-0000-0000-0000-000000000000");
    expect(Object.keys(snapshot.tables).sort()).toEqual([...tables].sort());
  });

  it("contains exactly one read-only statement, not generated initial DDL", () => {
    expect(baseline.replace(/--[^\n]*/g, "").trim()).toBe("SELECT 1;");
  });

  it("preserves an empty database after the legacy chain", () => {
    const db = legacyDatabase();
    try {
      const before = inspect(db);
      db.exec(baseline);
      expect(inspect(db)).toEqual(before);
      expect(before.rows).toEqual([[], [], []]);
    } finally {
      db.close();
    }
  });

  it("preserves legacy rows, rowids, null IDs, PK/FK/CHECKs and physical schema", () => {
    const db = legacyDatabase();
    try {
      seed(db);
      expectConstraints(db);
      const before = inspect(db);
      db.exec(baseline);
      expectConstraints(db);
      expect(inspect(db)).toEqual(before);
      // Even accidental repeat execution of the baseline must remain read-only.
      db.exec(baseline);
      expect(inspect(db)).toEqual(before);
    } finally {
      db.close();
    }
  });
});
