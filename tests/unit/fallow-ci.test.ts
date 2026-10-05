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

function commit(directory: string): void {
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
}

function fixture(prepare?: (directory: string) => void): string {
  const directory = mkdtempSync(join(root, ".tmp-fallow-gate-"));
  fixtures.push(directory);
  // Do not inherit the parent checkout's shallow history in the unit-test job.
  git(directory, "init", "--quiet");
  commit(directory);
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
  prepare?.(directory);
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

function deadCodeBaseline(directory: string) {
  return JSON.parse(
    readFileSync(
      join(directory, "tooling/fallow/dead-code.baseline.json"),
      "utf8",
    ),
  );
}

function flags(directory: string, names: string[]): void {
  write(
    directory,
    "src/lib/flags.ts",
    names
      .map(
        (name) =>
          `// fallow-ignore-next-line unused-export -- Deliberately stale fixture suppression.\nexport const ${name} = 1;`,
      )
      .join("\n"),
  );
  write(
    directory,
    "src/routes/+page.server.ts",
    `import { ${names.join(", ")} } from "../lib/flags"; export const load = () => { console.log(${names.join(", ")}); return {}; };`,
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
    expect(deadCodeBaseline(directory).identity).toBe("dc1");
    expect(report(directory, "dead-code").baseline_staleness).toMatchObject({
      change_scoped: true,
      scope_reasons: ["include-entry-exports"],
      stale_entries: 0,
    });
    expect(
      report(directory, "dead-code").gate_outcomes["stale-baseline"],
    ).toMatchObject({
      enforced: false,
      status: "skipped",
    });
  });

  it("accepts native full-scope enforcement when entry export checking is off", () => {
    const directory = fixture((directory) => {
      write(
        directory,
        ".fallowrc.jsonc",
        readFileSync(join(root, ".fallowrc.jsonc"), "utf8").replace(
          '"includeEntryExports": true',
          '"includeEntryExports": false',
        ),
      );
    });
    expect(runGate(directory)).toBe(0);
    expect(
      report(directory, "dead-code").baseline_staleness.change_scoped,
    ).toBe(false);
    expect(
      report(directory, "dead-code").gate_outcomes["stale-baseline"],
    ).toMatchObject({
      enforced: true,
      status: "pass",
    });
    rmSync(join(directory, "src/lib/retained.ts"));
    expect(runGate(directory)).toBe(1);
  });

  it("rejects accidental entry exports while retaining framework exports", () => {
    const directory = fixture();
    write(
      directory,
      "src/routes/+page.server.ts",
      "export const load = () => ({ value: 1 }); export const accidentalExport = 1;",
    );
    expect(runGate(directory)).toBe(1);
    expect(
      report(directory, "dead-code").unused_exports.map(
        (finding: { export_name: string }) => finding.export_name,
      ),
    ).toEqual(["accidentalExport"]);
  });

  it("rejects changed-file scope even when every baseline occurrence matched", () => {
    const directory = fixture((directory) => {
      write(
        directory,
        "src/routes/+page.server.ts",
        "export const load = () => ({});",
      );
    });
    git(directory, "add", "src");
    commit(directory);
    write(
      directory,
      "src/lib/retained.ts",
      "export const retained = 1; // changed\n",
    );
    git(directory, "add", "src/lib/retained.ts");
    commit(directory);
    const result = spawnSync(
      process.execPath,
      [
        cli,
        "dead-code",
        "--no-cache",
        "--quiet",
        "--format",
        "json",
        "--baseline",
        join(directory, "tooling/fallow/dead-code.baseline.json"),
        "--fail-on-stale-baseline",
        "--changed-since",
        "HEAD~1",
      ],
      { cwd: directory, encoding: "utf8", timeout: 15_000 },
    );
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.total_issues).toBe(0);
    expect(output.baseline_staleness.stale_entries).toBe(0);
    expect(output.baseline_staleness.scope_reasons).toEqual([
      "changed-since",
      "include-entry-exports",
    ]);
    expect(() =>
      verifyReport("dead-code", output, deadCodeBaseline(directory)),
    ).toThrow();
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
    expect(
      report(directory, "dead-code").gate_outcomes["stale-baseline"],
    ).toMatchObject({
      enforced: false,
      status: "skipped",
    });
  });

  it("does not trade a missing baseline identity for a repeated current identity", () => {
    const directory = fixture((directory) => flags(directory, ["flagA"]));
    const baseline = deadCodeBaseline(directory);
    expect(baseline.identity).toBe("dc1");
    expect(baseline.stale_suppressions).toHaveLength(1);
    expect(runGate(directory)).toBe(0);

    rmSync(join(directory, "src/lib/retained.ts"));
    flags(directory, ["flagA", "flagB"]);
    expect(runGate(directory)).toBe(1);
    const output = report(directory, "dead-code");
    expect(output.stale_suppressions).toHaveLength(1);
    expect(output.baseline_staleness).toMatchObject({
      baseline_entries: 2,
      current_findings: 2,
      matched_entries: 1,
      stale_entries: 1,
    });
  });

  it("rejects a legacy baseline even when its entries match", () => {
    const directory = fixture();
    const baseline = deadCodeBaseline(directory);
    delete baseline.identity;
    baseline.unused_files = ["src/lib/retained.ts"];
    write(
      directory,
      "tooling/fallow/dead-code.baseline.json",
      JSON.stringify(baseline),
    );
    expect(runGate(directory)).toBe(1);
    expect(report(directory, "dupes").kind).toBe("dupes");
    expect(report(directory, "health").kind).toBe("health");
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

  it.each(["{", JSON.stringify({ kind: "health", findings: [] })])(
    "fails closed on a corrupt or foreign baseline and collects other reports %#",
    (contents) => {
      const directory = fixture();
      write(directory, "tooling/fallow/dead-code.baseline.json", contents);
      expect(runGate(directory)).toBe(1);
      expect(report(directory, "dupes").kind).toBe("dupes");
      expect(report(directory, "health").kind).toBe("health");
    },
  );
});

const emptyStaleness = {
  baseline_entries: 0,
  matched_entries: 0,
  stale_entries: 0,
  current_findings: 0,
  moved_entries: 0,
  change_scoped: false,
  gate_trips: false,
};

const cleanDupes = {
  kind: "dupes",
  stats: { clone_groups: 0 },
  gate_outcomes: { "stale-baseline": { enforced: true, status: "pass" } },
  baseline_staleness: emptyStaleness,
};

const canonicalBaseline = {
  kind: "dead-code",
  identity: "dc1",
  scope_reasons: ["include-entry-exports"],
  unused_files: ["unused-file:src/lib/retained.ts"],
  unused_exports: [],
  unused_types: [],
  unused_dependencies: [],
  unused_dev_dependencies: [],
};

const cleanDeadCode = {
  kind: "dead-code",
  total_issues: 0,
  gate_outcomes: { "stale-baseline": { enforced: false, status: "skipped" } },
  baseline_staleness: {
    ...emptyStaleness,
    baseline_entries: 1,
    matched_entries: 1,
    current_findings: 1,
    change_scoped: true,
    scope_reasons: ["include-entry-exports"],
  },
};

function withDeadCodeStaleness(changes: Record<string, unknown>) {
  return {
    ...cleanDeadCode,
    baseline_staleness: { ...cleanDeadCode.baseline_staleness, ...changes },
  };
}

describe("Fallow report validation", () => {
  it("accepts complete native and independently matched canonical reports", () => {
    expect(() => verifyReport("dupes", cleanDupes)).not.toThrow();
    expect(() =>
      verifyReport("dupes", {
        ...cleanDupes,
        workspace_diagnostics: [
          { kind: "future-informational-note", degrades_analysis: false },
        ],
      }),
    ).not.toThrow();
    expect(() =>
      verifyReport("dead-code", cleanDeadCode, canonicalBaseline),
    ).not.toThrow();
    expect(() =>
      verifyReport(
        "dead-code",
        {
          ...cleanDeadCode,
          baseline_staleness: {
            ...cleanDeadCode.baseline_staleness,
            change_scoped: false,
            scope_reasons: [],
          },
          gate_outcomes: {
            "stale-baseline": { enforced: true, status: "pass" },
          },
        },
        canonicalBaseline,
      ),
    ).not.toThrow();
  });

  it.each([
    null,
    {},
    { ...cleanDupes, kind: "unknown" },
    { ...cleanDupes, stats: {} },
    { ...cleanDupes, stats: { clone_groups: "0" } },
    { ...cleanDupes, gate_outcomes: {} },
    { ...cleanDupes, workspace_diagnostics: null },
    { ...cleanDupes, workspace_diagnostics: [null] },
    { ...cleanDupes, workspace_diagnostics: [{ degrades_analysis: "false" }] },
    { ...cleanDupes, workspace_diagnostics: [{ degrades_analysis: null }] },
    {
      ...cleanDupes,
      workspace_diagnostics: [{ kind: "unknown", degrades_analysis: true }],
    },
    { ...cleanDupes, workspace_diagnostics: [{ degrades_analysis: true }] },
  ])("fails closed on an invalid or incomplete report %#", (value) => {
    expect(() => verifyReport("dupes", value)).toThrow();
  });

  it.each([
    {},
    { enforced: false, status: "pass" },
    { enforced: true, status: "skipped" },
    { enforced: true, status: "fail" },
    { enforced: "false", status: "skipped" },
  ])("rejects an unexpected entry-aware native verdict %#", (gate) => {
    expect(() =>
      verifyReport(
        "dead-code",
        {
          ...cleanDeadCode,
          gate_outcomes: { "stale-baseline": gate },
        },
        canonicalBaseline,
      ),
    ).toThrow();
  });

  it.each([
    { change_scoped: false },
    { change_scoped: undefined },
    { change_scoped: "true" },
    { scope_reasons: [] },
    { scope_reasons: undefined },
    { scope_reasons: "include-entry-exports" },
    { scope_reasons: ["file"] },
    { scope_reasons: ["include-entry-exports", "file"] },
    { scope_reasons: ["include-entry-exports", "unknown-scope"] },
    { scope_reasons: ["include-entry-exports", "include-entry-exports"] },
    { matched_entries: 0, stale_entries: 1 },
    { matched_entries: 0, stale_entries: 0 },
    { matched_entries: 2 },
    { current_findings: 0 },
    { current_findings: 2 },
    { gate_trips: true },
    { gate_trips: undefined },
    { unrecognised_format: true },
    { unrecognised_format: null },
    { unrecognised_format: "false" },
    { format: "legacy" },
  ])(
    "rejects missing, inconsistent, or widened entry-aware evidence %#",
    (changes) => {
      expect(() =>
        verifyReport(
          "dead-code",
          withDeadCodeStaleness(changes),
          canonicalBaseline,
        ),
      ).toThrow();
    },
  );

  it.each([
    "baseline_entries",
    "matched_entries",
    "stale_entries",
    "current_findings",
    "moved_entries",
  ])("requires a nonnegative safe integer for %s", (field) => {
    for (const invalid of [
      undefined,
      null,
      "0",
      -1,
      0.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(() =>
        verifyReport(
          "dead-code",
          withDeadCodeStaleness({ [field]: invalid }),
          canonicalBaseline,
        ),
      ).toThrow();
    }
  });

  it.each([
    undefined,
    null,
    {},
    { ...canonicalBaseline, identity: undefined },
    { ...canonicalBaseline, identity: "future" },
    { ...canonicalBaseline, kind: "dupes" },
    { ...canonicalBaseline, unused_files: [] },
    {
      ...canonicalBaseline,
      unused_files: [
        "unused-file:src/lib/retained.ts",
        "unused-file:missing.ts",
      ],
    },
    { ...canonicalBaseline, unused_files: "unused-file:src/lib/retained.ts" },
    { ...canonicalBaseline, unused_files: [null] },
  ])(
    "requires the matching canonical baseline for dead-code %#",
    (baseline) => {
      expect(() =>
        verifyReport("dead-code", cleanDeadCode, baseline),
      ).toThrow();
    },
  );

  it.each(["dupes", "health"] as const)(
    "never accepts a skipped native gate for %s",
    (kind) => {
      const value = {
        kind,
        stats: { clone_groups: 0 },
        findings: [],
        summary: { baseline_staleness: cleanDeadCode.baseline_staleness },
        baseline_staleness: cleanDeadCode.baseline_staleness,
        gate_outcomes: cleanDeadCode.gate_outcomes,
      };
      expect(() => verifyReport(kind, value)).toThrow();
    },
  );
});
