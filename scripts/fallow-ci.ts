import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const cli = createRequire(import.meta.url).resolve("fallow/bin/fallow");
const analyses = ["dead-code", "dupes", "health"] as const;
type Analysis = (typeof analyses)[number];

function object(value: unknown): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}

function array(value: unknown): unknown[] {
  assert(Array.isArray(value));
  return value;
}

function newFindings(kind: Analysis, report: Record<string, unknown>): unknown {
  if (kind === "dead-code") return report.total_issues;
  if (kind === "dupes") return object(report.stats).clone_groups;
  return array(report.findings).length;
}

export function verifyReport(kind: Analysis, value: unknown): void {
  const report = object(value);
  assert.equal(report.kind, kind, "Unexpected Fallow report kind");
  // dupes --fail-on-issues does not reject clone groups in the pinned version.
  // Inspect filtered findings explicitly for every analysis, never raw totals.
  assert.equal(newFindings(kind, report), 0, `New ${kind} findings`);
  const gates = object(report.gate_outcomes);
  const staleGate = object(gates["stale-baseline"]);
  assert.equal(staleGate.enforced, true, "Baseline gate must be enforced");
  assert.equal(staleGate.status, "pass", "Stale baseline entries");
  for (const diagnostic of array(report.workspace_diagnostics ?? [])) {
    assert.notEqual(
      object(diagnostic).degrades_analysis,
      true,
      "Fallow analysis is incomplete; inspect workspace_diagnostics",
    );
  }
}

function options(kind: Analysis): string[] {
  if (kind === "dupes") return ["--no-fragments"];
  const parse = ["--fail-on-parse-error"];
  if (kind === "health") parse.push("--baseline-mode", "identity");
  return parse;
}

function analyze(kind: Analysis, root: string, output: string): void {
  const result = spawnSync(
    process.execPath,
    [
      cli,
      kind,
      "--no-cache",
      "--format",
      "json",
      "--quiet",
      "--baseline",
      join(root, "tooling/fallow", `${kind}.baseline.json`),
      "--fail-on-issues",
      "--fail-on-stale-baseline",
      ...options(kind),
    ],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 120_000,
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  writeFileSync(join(output, `${kind}.json`), result.stdout ?? "");
  writeFileSync(join(output, `${kind}.stderr.txt`), result.stderr ?? "");
  assert.ifError(result.error);
  assert.equal(
    result.status,
    0,
    `${kind} exited ${result.status}: ${result.stderr}`,
  );
  verifyReport(kind, JSON.parse(result.stdout));
}

function runFallowGate(root: string): boolean {
  const output = join(root, ".tmp-fallow-ci");
  mkdirSync(output, { recursive: true });
  let passed = true;
  for (const kind of analyses) {
    try {
      analyze(kind, root, output);
      console.log(`Fallow ${kind}: no new findings or stale baseline entries`);
    } catch (error) {
      passed = false;
      console.error(`Fallow ${kind}: FAILED`, error);
    }
  }
  console.log(`Fallow reports: ${output}`);
  return passed;
}

if (import.meta.main) {
  process.exitCode = runFallowGate(process.cwd()) ? 0 : 1;
}
