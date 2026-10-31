import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readLatestSnapshot, verifyImmutableHistory } from "./history";

const root = resolve(import.meta.dirname, "../..");
const directories: string[] = [];
function fixture() {
  const directory = mkdtempSync(join(root, ".tmp-migration-history-"));
  directories.push(directory);
  cpSync(join(root, "migrations"), join(directory, "migrations"), {
    recursive: true,
  });
  return directory;
}
function change(
  directory: string,
  file: string,
  replace: (text: string) => string,
) {
  const path = join(directory, "migrations", file);
  writeFileSync(path, replace(readFileSync(path, "utf8")));
}
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("migration history guards", () => {
  it.each([
    [
      "missing SQL",
      (directory: string) =>
        unlinkSync(
          join(directory, "migrations/20261002021516_legacy_baseline.sql"),
        ),
    ],
    [
      "orphan SQL",
      (directory: string) =>
        writeFileSync(
          join(directory, "migrations/20990101000000_orphan.sql"),
          "SELECT 1;",
        ),
    ],
    [
      "missing snapshot",
      (directory: string) =>
        unlinkSync(
          join(directory, "migrations/meta/20261002021516_snapshot.json"),
        ),
    ],
    [
      "broken snapshot chain",
      (directory: string) =>
        change(directory, "meta/20261002021516_snapshot.json", (text) =>
          text.replace(
            "00000000-0000-0000-0000-000000000000",
            "00000000-0000-0000-0000-000000000001",
          ),
        ),
    ],
    [
      "noncontiguous journal",
      (directory: string) =>
        change(directory, "meta/_journal.json", (text) =>
          text.replace('"idx": 0', '"idx": 3'),
        ),
    ],
  ])("rejects %s independently of drizzle-kit check", (_name, mutate) => {
    const directory = fixture();
    mutate(directory);
    expect(() => readLatestSnapshot(directory)).toThrow();
  });

  it("rejects edited historical SQL/snapshot/journal but accepts append-only artifacts", () => {
    const directory = fixture();
    const git = (...args: string[]) =>
      execFileSync("git", args, { cwd: directory, encoding: "utf8" }).trim();
    git("init", "--quiet");
    git("add", "migrations");
    git(
      "-c",
      "user.name=Migration fixture",
      "-c",
      "user.email=migration@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--quiet",
      "-m",
      "Immutable migration fixture",
    );
    const base = git("rev-parse", "HEAD");
    expect(() => verifyImmutableHistory(directory, base)).not.toThrow();
    for (const file of [
      "0002_reset_to_budget_periods.sql",
      "meta/20261002021516_snapshot.json",
    ]) {
      change(directory, file, (text) => `${text}\n`);
      expect(() => verifyImmutableHistory(directory, base)).toThrow(
        /Existing migration artifact changed/,
      );
      git("restore", `migrations/${file}`);
    }
    change(directory, "meta/_journal.json", (text) =>
      text.replace('"idx": 0', '"idx": 1'),
    );
    expect(() => verifyImmutableHistory(directory, base)).toThrow(
      /Journal history is append-only/,
    );
    git("restore", "migrations/meta/_journal.json");
    writeFileSync(
      join(directory, "migrations/20990101000000_new.sql"),
      "SELECT 1;",
    );
    expect(() => verifyImmutableHistory(directory, base)).not.toThrow();
    // Immutability alone is deliberately not completeness; the chain gate rejects it.
    expect(() => readLatestSnapshot(directory)).toThrow(
      /SQL files and journal must match/,
    );
  });
});
