import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

function count(value: unknown): number {
  assert(
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0,
    "Invalid baseline count",
  );
  return value;
}

function verifyBaseline(
  kind: Analysis,
  report: Record<string, unknown>,
  baseline: unknown,
): void {
  const stale = object(
    kind === "health"
      ? object(report.summary).baseline_staleness
      : report.baseline_staleness,
  );
  const entries = count(stale.baseline_entries);
  const matched = count(stale.matched_entries);
  const current = count(stale.current_findings);
  const moved = count(stale.moved_entries);
  assert(moved <= matched, "Inconsistent moved count");
  assert(
    matched <= entries && matched <= current,
    "Inconsistent baseline counts",
  );
  assert.equal(
    count(stale.stale_entries),
    entries - matched,
    "Inconsistent unmatched count",
  );
  assert.equal(
    stale.unrecognised_format === undefined ? false : stale.unrecognised_format,
    false,
    "Unrecognised baseline format",
  );
  assert.equal(stale.gate_trips, false, "Baseline gate tripped");
  const gate = object(object(report.gate_outcomes)["stale-baseline"]);
  if (kind === "dead-code") {
    const saved = object(baseline);
    assert.equal(saved.kind, kind, "Wrong baseline kind");
    assert.equal(
      saved.identity,
      "dc1",
      "Occurrence-matched dc1 baseline required",
    );
    assert.equal(stale.format, undefined, "Unsupported baseline format");
    let savedEntries = 0;
    for (const [key, value] of Object.entries(saved)) {
      if (
        ["kind", "identity", "analysis_identity", "scope_reasons"].includes(key)
      )
        continue;
      const identities = array(value);
      assert(
        identities.every((identity) => typeof identity === "string"),
        "Invalid baseline identities",
      );
      savedEntries += identities.length;
    }
    assert.equal(entries, savedEntries, "Loaded baseline count mismatch");
    assert.equal(current, matched, "Unfiltered dead-code findings remain");
  }
  if (stale.change_scoped === true) {
    assert.equal(kind, "dead-code", "Unexpected scoped analysis");
    assert.deepEqual(
      stale.scope_reasons,
      ["include-entry-exports"],
      "Unexpected baseline scope",
    );
    assert.equal(
      gate.enforced,
      false,
      "Unexpected scoped baseline enforcement",
    );
    assert.equal(
      gate.status,
      "skipped",
      "Expected native freshness check to be skipped",
    );
    // This is a separate repository policy, not a native freshness verdict.
    // dc1 consumes one saved occurrence per match. Full equality proves every
    // accepted occurrence was observed; an unmatched occurrence needs review.
  } else {
    assert.equal(stale.change_scoped, false, "Missing baseline scope");
    assert.deepEqual(
      stale.scope_reasons === undefined ? [] : stale.scope_reasons,
      [],
      "Unexpected baseline scope",
    );
    assert.equal(gate.enforced, true, "Baseline gate must be enforced");
    assert.equal(gate.status, "pass", "Stale baseline entries");
  }
  assert.equal(
    matched,
    entries,
    "Unmatched baseline entries; inspect scope and identities",
  );
}

export function verifyReport(
  kind: Analysis,
  value: unknown,
  baseline?: unknown,
): void {
  const report = object(value);
  assert.equal(report.kind, kind, "Unexpected Fallow report kind");
  // dupes --fail-on-issues does not reject clone groups in the pinned version.
  // Inspect filtered findings explicitly for every analysis, never raw totals.
  assert.equal(newFindings(kind, report), 0, `New ${kind} findings`);
  verifyBaseline(kind, report, baseline);
  for (const diagnostic of array(
    report.workspace_diagnostics === undefined
      ? []
      : report.workspace_diagnostics,
  )) {
    const degraded = object(diagnostic).degrades_analysis;
    assert.equal(
      degraded === undefined ? false : degraded,
      false,
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
  const baselinePath = join(root, "tooling/fallow", `${kind}.baseline.json`);
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
      baselinePath,
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
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  verifyReport(kind, JSON.parse(result.stdout), baseline);
}

if (import.meta.main) {
  const root = process.cwd();
  const output = join(root, ".tmp-fallow-ci");
  mkdirSync(output, { recursive: true });
  let passed = true;
  for (const kind of analyses) {
    try {
      analyze(kind, root, output);
      console.log(
        `Fallow ${kind}: no new findings; all baseline entries matched`,
      );
    } catch (error) {
      passed = false;
      console.error(`Fallow ${kind}: FAILED`, error);
    }
  }
  console.log(`Fallow reports: ${output}`);
  process.exitCode = passed ? 0 : 1;
}
