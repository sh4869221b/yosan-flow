import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { comparisonRows } from "../../scripts/e2e-compare.ts";

const fixtures: string[] = [];
function fixture() {
  const root = mkdtempSync(join(process.cwd(), ".tmp-compare-test-"));
  fixtures.push(root);
  const jobs = [];
  for (const phase of ["cold", "warm"])
    for (const method of ["nix", "container"])
      for (const shard of ["1", "2"]) {
        const path = join(root, `${phase}-${method}-${shard}`);
        mkdirSync(join(path, ".tmp-e2e-compare"), { recursive: true });
        mkdirSync(join(path, "test-results"));
        const source = {
          sha: "a".repeat(40),
          lockHash: "b".repeat(64),
          nodeVersion: "24.21.0",
          method,
          shard,
        };
        writeFileSync(
          join(path, ".tmp-e2e-compare/runner.json"),
          JSON.stringify({
            ...source,
            environment: {
              ImageOS: "ubuntu24",
              ImageVersion: "fixed",
              RUNNER_ARCH: "X64",
              E2E_PHASE: phase,
            },
          }),
        );
        writeFileSync(
          join(path, ".tmp-e2e-compare/installed.json"),
          JSON.stringify({
            ...source,
            node: "v24.21.0",
            versions: ["1.63.0", "1.63.0", "1.63.0"],
            tests: 143,
            workers: 1,
          }),
        );
        writeFileSync(
          join(path, "test-results/results.json"),
          JSON.stringify({
            stats: {
              expected: shard === "1" ? 82 : 61,
              unexpected: 0,
              flaky: 0,
              skipped: 0,
              duration: 1000,
            },
          }),
        );
        jobs.push({
          name: `Compare ${phase} ${method} (shard ${shard}/2)`,
          conclusion: "success",
          started_at: "2026-10-12T01:00:00Z",
          completed_at: "2026-10-12T01:01:00Z",
          steps: [],
        });
      }
  writeFileSync(join(root, "jobs.json"), JSON.stringify({ jobs }));
  return root;
}
function update(
  root: string,
  file: string,
  change: (data: Record<string, unknown>) => unknown,
) {
  const path = join(root, "warm-container-2", file);
  writeFileSync(
    path,
    JSON.stringify(change(JSON.parse(readFileSync(path, "utf8")))),
  );
}
afterEach(() => {
  for (const root of fixtures.splice(0))
    rmSync(root, { recursive: true, force: true });
});

it("accepts only the complete eight-job matched comparison", () => {
  const root = fixture();
  const rows = comparisonRows(root, join(root, "jobs.json"));
  expect(rows).toHaveLength(8);
  expect(rows.every((row) => row.jobSeconds === 60)).toBe(true);
});
it("rejects a different runner image even when every test passed", () => {
  const root = fixture();
  update(root, ".tmp-e2e-compare/runner.json", (data) => ({
    ...data,
    environment: {
      ImageOS: "ubuntu24",
      ImageVersion: "different",
      RUNNER_ARCH: "X64",
      E2E_PHASE: "warm",
    },
  }));
  expect(() => comparisonRows(root, join(root, "jobs.json"))).toThrow(
    /runner images differ/,
  );
});
it("rejects dependency drift, reduced test counts and flaky outcomes", () => {
  for (const property of ["lockHash", "tests", "workers"]) {
    const root = fixture();
    update(root, ".tmp-e2e-compare/installed.json", (data) => ({
      ...data,
      [property]: property === "lockHash" ? "changed" : 0,
    }));
    expect(() => comparisonRows(root, join(root, "jobs.json"))).toThrow();
  }
  const root = fixture();
  update(root, "test-results/results.json", () => ({
    stats: { expected: 61, unexpected: 0, flaky: 1, skipped: 0 },
  }));
  expect(() => comparisonRows(root, join(root, "jobs.json"))).toThrow();
});
