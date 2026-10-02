import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

export function createMigrationDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL);`);
  return db;
}

export function applyMigrations(
  db: DatabaseSync,
  migrations: readonly { name: string; sql: string }[],
) {
  const applied = new Set(
    db
      .prepare("SELECT name FROM d1_migrations")
      .all()
      .map((row) => row.name),
  );
  for (const { name, sql } of migrations) {
    if (applied.has(name)) continue;
    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.prepare("INSERT INTO d1_migrations (name) VALUES (?)").run(name);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  assert.equal(
    db.prepare("PRAGMA foreign_keys").get()?.foreign_keys,
    1,
    "Migrations must retain FK enforcement",
  );
  assert.deepEqual(
    db.prepare("PRAGMA foreign_key_check").all(),
    [],
    "Broken foreign keys after migration",
  );
  assert.equal(
    db.prepare("PRAGMA integrity_check").get()?.integrity_check,
    "ok",
  );
}
