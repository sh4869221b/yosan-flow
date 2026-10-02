import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { inspectSchema } from "./schema";

function inspect(sql: string) {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(sql);
    return inspectSchema(db);
  } finally {
    db.close();
  }
}

describe("physical schema comparison semantics", () => {
  it.each([
    [
      "generated expression with mixed-case column",
      'CREATE TABLE t (x INT, "Y" INT AS (x + 1))',
      'CREATE TABLE t (x INT, "Y" INT AS (x + 2))',
    ],
    [
      "unindexed collation",
      "CREATE TABLE t (x TEXT COLLATE NOCASE)",
      "CREATE TABLE t (x TEXT COLLATE BINARY)",
    ],
    [
      "autoincrement",
      "CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT)",
      "CREATE TABLE t (id INTEGER PRIMARY KEY)",
    ],
    [
      "CHECK literal case",
      "CREATE TABLE t (x TEXT CHECK (x = 'A'))",
      "CREATE TABLE t (x TEXT CHECK (x = 'a'))",
    ],
    [
      "partial-index predicate",
      "CREATE TABLE t (x INT); CREATE INDEX i ON t (x) WHERE x > 1",
      "CREATE TABLE t (x INT); CREATE INDEX i ON t (x) WHERE x > 2",
    ],
    [
      "composite-FK grouping",
      "CREATE TABLE p (a, b, c, d); CREATE TABLE t (x, y, z, w, FOREIGN KEY(x,y) REFERENCES p(a,b), FOREIGN KEY(z,w) REFERENCES p(c,d))",
      "CREATE TABLE p (a, b, c, d); CREATE TABLE t (x, y, z, w, FOREIGN KEY(x,w) REFERENCES p(a,d), FOREIGN KEY(z,y) REFERENCES p(c,b))",
    ],
  ])("detects %s changes", (_name, before, after) => {
    expect(inspect(before)).not.toEqual(inspect(after));
  });

  it("does not hide user tables beginning with sqlite without the engine underscore", () => {
    expect(inspect("CREATE TABLE sqliteSettings (value TEXT)")).not.toEqual([]);
  });

  it("normalizes quoting and CHECK names while retaining expression semantics", () => {
    expect(inspect("CREATE TABLE t (x INT CHECK (x >= 0))")).toEqual(
      inspect(
        'CREATE TABLE `t` (`x` INT, CONSTRAINT "non_negative" CHECK("t"."x" >= 0))',
      ),
    );
  });

  it.each([
    "CREATE TABLE t (id INTEGER PRIMARY KEY ON CONFLICT REPLACE)",
    "CREATE TABLE p (id PRIMARY KEY); CREATE TABLE t (x REFERENCES p(id) DEFERRABLE INITIALLY DEFERRED)",
  ])("fails closed for unsupported table clauses", (sql) => {
    expect(() => inspect(sql)).toThrow(/Add explicit schema inspection/);
  });
});
