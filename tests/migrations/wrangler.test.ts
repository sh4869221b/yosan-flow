import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { expect, it } from "vitest";
import { readMigrations } from "./history";
import { legacyData, legacyProjection, legacyTables } from "./preservation";

const root = resolve(import.meta.dirname, "../..");
const cli = join(
  dirname(createRequire(import.meta.url).resolve("wrangler/package.json")),
  "bin/wrangler.js",
);

it("uses Wrangler's actual pending-migration ledger for empty and legacy local D1", () => {
  const directory = mkdtempSync(join(root, ".tmp-migration-d1-"));
  const staged = join(directory, "migrations");
  mkdirSync(staged);
  const config = join(directory, "wrangler.json");
  writeFileSync(
    config,
    JSON.stringify({
      name: "migration-safety",
      compatibility_date: "2026-09-01",
      d1_databases: [
        {
          binding: "DB",
          database_name: "migration-safety",
          database_id: "00000000-0000-0000-0000-000000000000",
          migrations_dir: staged,
          migrations_pattern: `${staged}/*.sql`,
        },
      ],
    }),
  );
  const migrations = readMigrations();
  const copy = (items: typeof migrations) => {
    for (const { name, sql } of items) writeFileSync(join(staged, name), sql);
  };
  const run = (state: string, args: string[]) => {
    const result = spawnSync(
      process.execPath,
      [
        cli,
        "d1",
        ...args,
        "--local",
        "--config",
        config,
        "--persist-to",
        join(directory, state),
      ],
      {
        cwd: directory,
        encoding: "utf8",
        timeout: 60_000,
        env: {
          ...process.env,
          CI: "1",
          WRANGLER_SEND_METRICS: "false",
          XDG_CONFIG_HOME: join(directory, "config"),
        },
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    return result.stdout;
  };
  const query = (state: string, sql: string) =>
    JSON.parse(run(state, ["execute", "DB", "--json", "--command", sql])) as {
      results: Record<string, unknown>[];
    }[];
  const read = (state: string) =>
    query(
      state,
      legacyTables
        .map(
          (table) =>
            `SELECT ${legacyProjection(table)} FROM ${table} ORDER BY rowid;`,
        )
        .join("\n"),
    ).map(({ results }) => results);
  try {
    copy(migrations.slice(0, 2));
    run("legacy", ["migrations", "apply", "DB"]);
    const fixture = join(directory, "fixture.sql");
    writeFileSync(fixture, legacyData);
    run("legacy", ["execute", "DB", "--file", fixture]);
    const before = read("legacy");
    expect(before.map((rows) => rows.length)).toEqual([3, 2, 4]);
    copy(migrations.slice(2));
    run("legacy", ["migrations", "apply", "DB"]);
    expect(read("legacy")).toEqual(before);
    run("empty", ["migrations", "apply", "DB"]);
    expect(read("empty")).toEqual([[], [], []]);
    for (const state of ["empty", "legacy"]) {
      const records = query(
        state,
        "SELECT name FROM d1_migrations ORDER BY id",
      )[0].results;
      expect(records.map(({ name }) => name)).toEqual(
        migrations.map(({ name }) => name),
      );
      expect(query(state, "PRAGMA foreign_key_check")[0].results).toEqual([]);
      run(state, ["migrations", "apply", "DB"]);
      expect(
        query(state, "SELECT name FROM d1_migrations ORDER BY id")[0].results,
      ).toEqual(records);
    }
    expect(read("legacy")).toEqual(before);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 120_000);
