import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { DrizzleSQLiteSnapshotJSON } from "drizzle-kit/api";

const project = resolve(import.meta.dirname, "../..");
const legacy = ["0001_initial.sql", "0002_reset_to_budget_periods.sql"];
type Journal = { entries: { idx: number; when: number; tag: string }[] };

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function readMigrations(root = project) {
  return readdirSync(join(root, "migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({
      name,
      sql: readFileSync(join(root, "migrations", name), "utf8"),
    }));
}

export function readLatestSnapshot(root = project) {
  const directory = join(root, "migrations");
  const journal = readJson<Journal>(join(directory, "meta/_journal.json"));
  assert(journal.entries.length > 0, "Migration journal is empty");
  const snapshots: string[] = [];
  let previousId = "00000000-0000-0000-0000-000000000000";
  let latest: DrizzleSQLiteSnapshotJSON | undefined;
  journal.entries.forEach((entry, index) => {
    assert.equal(entry.idx, index, "Journal indices must be contiguous");
    assert.match(entry.tag, /^\d{14}_[\w-]+$/, "Expected timestamp migration");
    if (index > 0) {
      assert(
        entry.when > journal.entries[index - 1].when,
        "Journal time order",
      );
      assert(
        entry.tag > journal.entries[index - 1].tag,
        "Migration file order",
      );
    }
    const name = `${entry.tag.slice(0, 14)}_snapshot.json`;
    snapshots.push(name);
    latest = readJson<DrizzleSQLiteSnapshotJSON>(join(directory, "meta", name));
    assert.equal(latest.prevId, previousId, "Broken snapshot chain");
    assert.notEqual(latest.id, previousId, "Repeated snapshot identity");
    previousId = latest.id;
  });
  assert.deepEqual(
    readMigrations(root).map(({ name }) => name),
    [...legacy, ...journal.entries.map(({ tag }) => `${tag}.sql`)],
    "SQL files and journal must match, after the two legacy migrations",
  );
  assert.deepEqual(
    readdirSync(join(directory, "meta"))
      .filter((name) => name.endsWith("_snapshot.json"))
      .sort(),
    snapshots,
    "Snapshot files and journal must match",
  );
  assert(latest);
  return latest;
}

export function verifyImmutableHistory(root = project, base?: string) {
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trimEnd();
  const reference =
    base ??
    process.env.MIGRATION_BASE_REF ??
    git("merge-base", "HEAD", "origin/main");
  assert.match(
    reference,
    /^[a-f0-9]{40}$/,
    "Expected an explicit migration base commit",
  );
  const files = git("ls-tree", "-r", "--name-only", reference, "migrations")
    .split("\n")
    .filter(Boolean);
  for (const file of files) {
    const before = execFileSync("git", ["show", `${reference}:${file}`], {
      cwd: root,
    });
    const after = readFileSync(join(root, file));
    if (file === "migrations/meta/_journal.json") {
      const oldJournal = JSON.parse(before.toString()) as Journal;
      const newJournal = JSON.parse(after.toString()) as Journal;
      assert.deepEqual(
        {
          ...newJournal,
          entries: newJournal.entries.slice(0, oldJournal.entries.length),
        },
        oldJournal,
        "Journal history is append-only",
      );
    } else {
      assert.deepEqual(
        after,
        before,
        `Existing migration artifact changed: ${file}`,
      );
    }
  }
  assert(files.length > 0, "Migration base has no history");
}
