import { describe, expect, it } from "vitest";
import { auditDatabaseSource } from "./helpers/database-source-guard";

const file = "src/sql-guard-fixture.ts";
const writer = "src/lib/server/db/day-entry-writer.ts";
const audit = (source: string, path = file) =>
  auditDatabaseSource(new Map([[path, source]]));

describe("database source guard negative controls", () => {
  it("finds direct, optional, bracket and aliased D1 access without inspecting comments", () => {
    const sources = [
      'db.prepare("SELECT 1")',
      'db?.prepare?.("SELECT 1")',
      'db["prepare"]("SELECT 1")',
      'const prepare = db.prepare; prepare("SELECT 1")',
      'const { prepare: query } = db; query("SELECT 1")',
      "const renamed = db; renamed.batch([])",
      'db.exec("SELECT 1")',
      "db.withSession()",
      "db.dump()",
    ];
    const violations = auditDatabaseSource(
      new Map(
        sources.map((source, i) => [
          `src/sql-negative-${i}.ts`,
          `declare const db: D1Database; ${source}`,
        ]),
      ),
    );
    expect(violations).toHaveLength(sources.length);
  });

  it("allows typed Drizzle and ordinary RegExp APIs without trusting variable names", () => {
    expect(
      audit(`
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
    `),
    ).toEqual([]);
    expect(audit("declare const orm: D1Database; orm.batch([])")).not.toEqual(
      [],
    );
  });

  it("does not allow a batch capability to become an exec or DDL exemption", () => {
    expect(audit("declare const db: D1Database; db.batch([])", writer)).toEqual(
      [],
    );
    expect(
      audit(
        'declare const db: D1Database; db.exec("CREATE TABLE bad (id)")',
        writer,
      ),
    ).toEqual([
      `${writer}: raw D1 exec outside its reviewed capability`,
      `${writer}: runtime DDL or PRAGMA`,
    ]);
  });

  it("rejects raw SQL and runtime migration escapes inside the permitted writer family", () => {
    expect(
      audit(
        `
      import { sql as statement } from "drizzle-orm";
      import { migrate } from "drizzle-orm/d1/migrator";
      statement.raw("SELECT 1");
      const { raw: escaped } = statement; escaped("SELECT 1");
      const unsafe = statement\`DROP TABLE budget_periods\`;
    `,
        writer,
      ),
    ).toEqual([
      `${writer}: runtime Drizzle migrator`,
      `${writer}: unreviewed Drizzle sql.raw`,
      `${writer}: runtime DDL or PRAGMA`,
    ]);
  });

  it("checks both Svelte scripts and markup even when a function is unused", () => {
    const path = "src/sql-guard-fixture.svelte";
    expect(
      audit(
        `
      <script module lang="ts">declare const db: D1Database; function unused() { db.prepare("SELECT 1"); }</script>
      <script lang="ts">declare const other: D1Database; const saved = other.batch;</script>
      <button onclick={() => other.exec("SELECT 1")}>Run</button>
      {#if true}{@const dumped = other.dump()}<p>{dumped}</p>{/if}
    `,
        path,
      ),
    ).toHaveLength(4);
  });
});
