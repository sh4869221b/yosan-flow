import { expect, it } from "vitest";
import { auditDatabaseSource } from "./helpers/database-source-guard";

const writer = "src/lib/server/db/day-entry-writer.ts";

it("distinguishes reviewed database access from raw D1, DDL and migration escapes", () => {
  const sources = new Map<string, string>();
  const expected: string[] = [];
  function addFixture(path: string, source: string, violations: string[]) {
    sources.set(path, source);
    expected.push(...violations.map((violation) => `${path}: ${violation}`));
  }

  const rawCalls = [
    ['db.prepare("SELECT 1")', "prepare"],
    ['db?.prepare?.("SELECT 1")', "prepare"],
    ['db["prepare"]("SELECT 1")', "prepare"],
    ['const prepare = db.prepare; prepare("SELECT 1")', "prepare"],
    ['const { prepare: query } = db; query("SELECT 1")', "prepare"],
    ["const renamed = db; renamed.batch([])", "batch"],
    ['db.exec("SELECT 1")', "exec"],
    ["db.withSession()", "withSession"],
    ["db.dump()", "dump"],
    ["const orm = db; orm.batch([])", "batch"],
  ];
  for (const [index, [source, method]] of rawCalls.entries()) {
    // Give each fixture a module scope so its declarations stay independent.
    addFixture(
      `src/sql-negative-${index}.ts`,
      `export {}; declare const db: D1Database; ${source}`,
      [`raw D1 ${method} outside its reviewed capability`],
    );
  }

  addFixture(
    "src/sql-guard-fixture.ts",
    `
      import { drizzle } from "drizzle-orm/d1";
      import { sql } from "drizzle-orm";
      import { sqliteTable, integer } from "drizzle-orm/sqlite-core";
      const table = sqliteTable("fixture", { id: integer("id") });
      declare const db: D1Database;
      const orm = drizzle(db);
      orm.batch([orm.select({ value: sql\`1\` }).from(table)]);
      orm.select({ value: sql\`1\` }).from(table).prepare();
      /date/.exec("date");
      const pattern = new RegExp("date"); pattern.exec("date");
      // db.prepare("SELECT 1") is not executable.
      const description = "db.prepare()";
    `,
    [],
  );

  addFixture(
    writer,
    `
      import { sql as statement } from "drizzle-orm";
      import { migrate } from "drizzle-orm/d1/migrator";
      statement.raw("SELECT 1");
      const { raw: escaped } = statement; escaped("SELECT 1");
      const unsafe = statement\`DROP TABLE budget_periods\`;
    `,
    [
      "runtime Drizzle migrator",
      "unreviewed Drizzle sql.raw",
      "runtime DDL or PRAGMA",
    ],
  );

  addFixture(
    "src/sql-guard-fixture.svelte",
    `
      <script module lang="ts">declare const db: D1Database; function unused() { db.prepare("SELECT 1"); }</script>
      <script lang="ts">declare const other: D1Database; const saved = other.batch;</script>
      <button onclick={() => other.exec("SELECT 1")}>Run</button>
      {#if true}{@const dumped = other.dump()}<p>{dumped}</p>{/if}
    `,
    ["prepare", "batch", "exec", "dump"].map(
      (method) => `raw D1 ${method} outside its reviewed capability`,
    ),
  );

  expect(auditDatabaseSource(sources).sort()).toEqual(expected.sort());
});

it("does not allow a batch capability to become an exec or DDL exemption", () => {
  // Audit the writer again so its CREATE check cannot share the DROP finding.
  const sources = new Map([
    [
      writer,
      `
        declare const db: D1Database;
        db.batch([]);
        db.exec("CREATE TABLE bad (id)");
      `,
    ],
  ]);
  expect(auditDatabaseSource(sources)).toEqual([
    `${writer}: raw D1 exec outside its reviewed capability`,
    `${writer}: runtime DDL or PRAGMA`,
  ]);
});
