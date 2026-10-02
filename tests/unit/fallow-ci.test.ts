import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { verifyReport } from "../../scripts/fallow-ci";

const root = resolve(import.meta.dirname, "../..");
const cli = createRequire(import.meta.url).resolve("fallow/bin/fallow");
const fixtures: string[] = [];

function write(directory: string, path: string, content: string): void {
  const destination = join(directory, path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, content);
}

function git(directory: string, ...args: string[]): string {
  const result = spawnSync("git", args, {
    cwd: directory,
    encoding: "utf8",
    timeout: 15_000,
  });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

function fixture(): string {
  const directory = mkdtempSync(join(root, ".tmp-fallow-gate-"));
  fixtures.push(directory);
  // Do not inherit the parent checkout's shallow history in the unit-test job.
  git(directory, "init", "--quiet");
  git(
    directory,
    "-c",
    "user.name=Fallow fixture",
    "-c",
    "user.email=fallow-fixture@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "--quiet",
    "--allow-empty",
    "-m",
    "Initialize isolated Fallow fixture",
  );
  symlinkSync(
    join(root, "node_modules"),
    join(directory, "node_modules"),
    "dir",
  );
  write(
    directory,
    ".fallowrc.jsonc",
    readFileSync(join(root, ".fallowrc.jsonc"), "utf8"),
  );
  write(
    directory,
    "package.json",
    JSON.stringify({
      private: true,
      devDependencies: { "@sveltejs/kit": "*" },
    }),
  );
  write(
    directory,
    "src/routes/+page.server.ts",
    "export const load = () => ({ value: 1 });",
  );
  // A reviewed existing finding is allowed; the next orphan must still fail.
  write(directory, "src/lib/retained.ts", "export const retained = 1;");
  for (const kind of ["dead-code", "dupes", "health"]) {
    const baseline = join(directory, "tooling/fallow", `${kind}.baseline.json`);
    mkdirSync(dirname(baseline), { recursive: true });
    const result = spawnSync(
      process.execPath,
      [
        cli,
        kind,
        "--no-cache",
        "--quiet",
        "--baseline-mode",
        "identity",
        "--save-baseline",
        baseline,
      ],
      { cwd: directory, encoding: "utf8", timeout: 15_000 },
    );
    expect(result.error).toBeUndefined();
    expect([0, 1]).toContain(result.status);
    expect(JSON.parse(readFileSync(baseline, "utf8")).kind).toBe(kind);
  }
  return directory;
}

function runGate(directory: string): number | null {
  const result = spawnSync(
    process.execPath,
    [join(root, "scripts/fallow-ci.ts")],
    {
      cwd: directory,
      encoding: "utf8",
      timeout: 30_000,
    },
  );
  expect(result.error).toBeUndefined();
  expect(result.stdout).toContain("Fallow reports:");
  return result.status;
}

function report(directory: string, kind: string) {
  return JSON.parse(
    readFileSync(join(directory, ".tmp-fallow-ci", `${kind}.json`), "utf8"),
  );
}

afterEach(() => {
  for (const directory of fixtures.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("Fallow CI gate with the installed binary", () => {
  it("accepts reviewed identities and still writes all three reports", () => {
    const directory = fixture();
    expect(runGate(directory)).toBe(0);
    expect(
      report(directory, "dead-code").baseline_staleness.matched_entries,
    ).toBeGreaterThanOrEqual(1);
    expect(report(directory, "dupes").stats.clone_groups).toBe(0);
    expect(report(directory, "health").findings).toEqual([]);
  });

  it("rejects new dead code without changing repository source or baselines", () => {
    const directory = fixture();
    write(
      directory,
      "src/lib/unused-sentinel.ts",
      "export const unused = true;",
    );
    expect(runGate(directory)).toBe(1);
    expect(
      report(directory, "dead-code").unused_files.map(
        (finding: { path: string }) => finding.path,
      ),
    ).toEqual(["src/lib/unused-sentinel.ts"]);
    expect(report(directory, "health").kind).toBe("health");
  });

  it("rejects new clone groups even though dupes exits zero", () => {
    const directory = fixture();
    const statements = Array.from(
      { length: 15 },
      (_, index) =>
        `const value${index} = input + ${index}; console.log(value${index});`,
    ).join("\n");
    const source = `export function copied(input: number) {\n${statements}\nreturn input;\n}\n`;
    write(directory, "src/lib/copy-a.ts", source);
    write(directory, "src/lib/copy-b.ts", source);
    write(
      directory,
      "src/routes/+page.server.ts",
      'import { copied as a } from "../lib/copy-a"; import { copied as b } from "../lib/copy-b"; export const load = () => ({ a: a(1), b: b(2) });',
    );
    expect(runGate(directory)).toBe(1);
    const output = report(directory, "dupes");
    expect(output.stats.clone_groups).toBeGreaterThan(0);
    expect(() => verifyReport("dupes", output)).toThrow("New dupes findings");
  });

  it("rejects a new health identity at the unchanged thresholds", () => {
    const directory = fixture();
    const branches = Array.from(
      { length: 25 },
      (_, index) => `if (input === ${index}) return ${index};`,
    ).join("\n");
    write(
      directory,
      "src/lib/complex.ts",
      `export function complex(input: number) {\n${branches}\nreturn -1;\n}`,
    );
    write(
      directory,
      "src/routes/+page.server.ts",
      'import { complex } from "../lib/complex"; export const load = () => ({ value: complex(1) });',
    );
    expect(runGate(directory)).toBe(1);
    expect(report(directory, "health").findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "complex" })]),
    );
  });

  it("rejects stale baseline entries rather than accumulating exemptions", () => {
    const directory = fixture();
    rmSync(join(directory, "src/lib/retained.ts"));
    expect(runGate(directory)).toBe(1);
    expect(
      report(directory, "dead-code").baseline_staleness.stale_entries,
    ).toBe(1);
  });

  it("rejects degraded shallow history and passes when complete history is restored", () => {
    const directory = fixture();
    // Git's shallow boundary is confined to this disposable one-commit repository.
    write(
      directory,
      ".git/shallow",
      `${git(directory, "rev-parse", "HEAD")}\n`,
    );
    expect(git(directory, "rev-parse", "--is-shallow-repository")).toBe("true");
    expect(runGate(directory)).toBe(1);
    expect(report(directory, "health").workspace_diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "shallow-clone",
          degrades_analysis: true,
        }),
      ]),
    );
    rmSync(join(directory, ".git/shallow"));
    expect(runGate(directory)).toBe(0);
  });

  it("fails closed on a missing baseline and continues collecting other reports", () => {
    const directory = fixture();
    rmSync(join(directory, "tooling/fallow/dead-code.baseline.json"));
    expect(runGate(directory)).toBe(1);
    expect(report(directory, "dupes").kind).toBe("dupes");
    expect(report(directory, "health").kind).toBe("health");
  });
});

const cleanDupes = {
  kind: "dupes",
  stats: { clone_groups: 0 },
  gate_outcomes: { "stale-baseline": { enforced: true, status: "pass" } },
};

describe("Fallow report validation", () => {
  it.each([
    null,
    {},
    { ...cleanDupes, kind: "unknown" },
    { ...cleanDupes, stats: {} },
    { ...cleanDupes, stats: { clone_groups: "0" } },
    { ...cleanDupes, gate_outcomes: {} },
    { ...cleanDupes, workspace_diagnostics: [{ degrades_analysis: true }] },
  ])("fails closed on an invalid or incomplete report %#", (value) => {
    expect(() => verifyReport("dupes", value)).toThrow();
  });
});
