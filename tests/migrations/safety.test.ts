import assert from "node:assert/strict";
import {
  generateSQLiteDrizzleJson,
  generateSQLiteMigration,
} from "drizzle-kit/api";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { beforeAll, describe, expect, it } from "vitest";
import * as model from "../../src/lib/server/db/schema";
import { applyMigrations, createMigrationDatabase } from "./database";
import {
  readLatestSnapshot,
  readMigrations,
  verifyImmutableHistory,
} from "./history";
import { legacyData, preservedRows, verifyConstraints } from "./preservation";
import {
  canonicalSchema,
  currentSnapshot,
  inspectSchema,
  verifyGeneratedSnapshot,
} from "./schema";

const migrations = readMigrations();
let expected: Awaited<ReturnType<typeof canonicalSchema>>;
beforeAll(async () => {
  expected = await canonicalSchema(await currentSnapshot());
});

function upgraded(extraSql?: string) {
  const db = createMigrationDatabase();
  applyMigrations(db, migrations.slice(0, 2));
  db.exec(legacyData);
  const before = preservedRows(db);
  const pending = migrations.slice(2);
  if (extraSql)
    pending.push({ name: "20990101000000_negative.sql", sql: extraSql });
  try {
    applyMigrations(db, pending);
    assert.deepEqual(
      preservedRows(db),
      before,
      "Legacy row counts, keys, values or rowids changed",
    );
    assert.deepEqual(
      inspectSchema(db),
      expected,
      "Applied migration schema drift",
    );
    verifyConstraints(db);
  } finally {
    db.close();
  }
}

describe("migration safety", () => {
  it("keeps previously committed SQL, snapshots and journal history immutable", () => {
    verifyImmutableHistory();
  });

  it("matches the canonical model to the latest generated snapshot", async () => {
    verifyGeneratedSnapshot(readLatestSnapshot(), await currentSnapshot());
  });

  it("ignores only snapshot identities and rename bookkeeping, not schema", async () => {
    const current = await currentSnapshot();
    const saved = structuredClone(current);
    saved.id = "independent-generation-id";
    saved.prevId = "previous-generation-id";
    saved._meta = { tables: { old: "new" }, columns: { old: "new" } };
    expect(() => verifyGeneratedSnapshot(saved, current)).not.toThrow();
    saved.tables.budget_periods.columns.status.default = "'closed'";
    expect(() => verifyGeneratedSnapshot(saved, current)).toThrow(
      /schema.ts differs/,
    );
  });

  it("rejects a schema-only change without regenerated metadata", async () => {
    const changed = await generateSQLiteDrizzleJson({
      ...model,
      missingMigration: sqliteTable("missing_migration", {
        id: text("id").primaryKey(),
      }),
    });
    expect(() =>
      verifyGeneratedSnapshot(readLatestSnapshot(), changed),
    ).toThrow(/schema.ts differs/);
  });

  it("applies every migration to an empty database and checks the physical schema", () => {
    const db = createMigrationDatabase();
    try {
      applyMigrations(db, migrations);
      expect(inspectSchema(db)).toEqual(expected);
      expect(preservedRows(db)).toEqual([[], [], []]);
      expect(
        db
          .prepare("SELECT name FROM d1_migrations ORDER BY id")
          .all()
          .map(({ name }) => name),
      ).toEqual(migrations.map(({ name }) => name));
      const before = inspectSchema(db);
      applyMigrations(db, migrations);
      expect(inspectSchema(db)).toEqual(before);
    } finally {
      db.close();
    }
  });

  it("upgrades recorded legacy migrations without losing rows, keys, values or rowids", () => {
    upgraded();
  });

  it("accepts an additive generated migration while preserving original fixture columns", async () => {
    const current = await currentSnapshot();
    const next = structuredClone(current);
    next.tables.budget_periods.columns.migration_note = {
      name: "migration_note",
      type: "text",
      primaryKey: false,
      notNull: false,
      default: "'new'",
    };
    const sql = (await generateSQLiteMigration(current, next)).join(";\n");
    const db = createMigrationDatabase();
    try {
      applyMigrations(db, migrations);
      db.exec(legacyData);
      const before = preservedRows(db);
      applyMigrations(db, [{ name: "20990101000000_add_column.sql", sql }]);
      expect(preservedRows(db)).toEqual(before);
      expect(inspectSchema(db)).toEqual(await canonicalSchema(next));
      expect(
        db.prepare("SELECT DISTINCT migration_note FROM budget_periods").all(),
      ).toEqual([{ migration_note: "new" }]);
    } finally {
      db.close();
    }
  });

  it.each([
    [
      "row loss",
      "DELETE FROM daily_operation_histories WHERE id = 'history-z'",
    ],
    [
      "value change",
      "UPDATE daily_operation_histories SET memo = 'lost' WHERE id = 'history-z'",
    ],
    [
      "rowid order change",
      "UPDATE daily_operation_histories SET rowid = 99 WHERE id = 'history-z'",
    ],
  ])("rejects %s even when all SQL executes successfully", (_name, sql) => {
    expect(() => upgraded(sql)).toThrow(
      /Legacy row counts, keys, values or rowids changed/,
    );
  });

  it.each([
    ["missing index", "DROP INDEX idx_daily_totals_period_date"],
    [
      "index direction",
      "DROP INDEX idx_daily_histories_period_date_created_at; CREATE INDEX idx_daily_histories_period_date_created_at ON daily_operation_histories (budget_period_id, date, created_at ASC)",
    ],
    ["untracked column", "ALTER TABLE daily_totals ADD COLUMN accidental TEXT"],
  ])(
    "rejects SQL-only %s drift without relying on metadata checks",
    (_name, sql) => {
      const db = createMigrationDatabase();
      try {
        applyMigrations(db, migrations);
        db.exec(sql);
        expect(inspectSchema(db)).not.toEqual(expected);
      } finally {
        db.close();
      }
    },
  );

  it.each([
    ["CHECK", "CHECK (total_used_yen >= 0)", ""],
    [
      "foreign key",
      "predecessor_period_id TEXT NULL REFERENCES budget_periods (id)",
      "predecessor_period_id TEXT NULL",
    ],
    [
      "primary key order",
      "PRIMARY KEY (budget_period_id, date)",
      "PRIMARY KEY (date, budget_period_id)",
    ],
    ["default", "DEFAULT 'active'", "DEFAULT 'closed'"],
    ["nullability", "year_month TEXT NOT NULL", "year_month TEXT"],
  ])(
    "detects physical %s drift even with unchanged snapshots",
    (_name, original, replacement) => {
      const db = createMigrationDatabase();
      try {
        const altered = migrations.map((migration) => ({
          ...migration,
          sql: migration.sql.replace(original, replacement),
        }));
        applyMigrations(db, altered);
        expect(inspectSchema(db)).not.toEqual(expected);
      } finally {
        db.close();
      }
    },
  );

  it("rejects invalid SQL without marking that migration applied", () => {
    const db = createMigrationDatabase();
    try {
      expect(() =>
        applyMigrations(db, [
          {
            name: "invalid.sql",
            sql: "CREATE TABLE partial (id TEXT); INVALID SQL;",
          },
        ]),
      ).toThrow();
      expect(db.prepare("SELECT name FROM d1_migrations").all()).toEqual([]);
      expect(
        db
          .prepare("SELECT name FROM sqlite_schema WHERE name = 'partial'")
          .all(),
      ).toEqual([]);
    } finally {
      db.close();
    }
  });
});
