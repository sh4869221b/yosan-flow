import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const workflow = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
const required = [
  "format-lint",
  "check",
  "fallow",
  "unit-tests",
  "integration-tests",
  "migrations",
  "build",
  "e2e",
];
const quality = workflow.slice(workflow.indexOf("  quality:\n"));
const command = quality.split("        run: |\n")[1];

function aggregate(results: Record<string, string>) {
  const script = command.replace(
    /\$\{\{ needs(?:\['([^']+)'\]|\.([^.]+))\.result \}\}/g,
    (_, bracket: string, dot: string) => results[bracket ?? dot],
  );
  return spawnSync("bash", ["-e", "-c", script], { encoding: "utf8" });
}

describe("Fallow CI wiring", () => {
  it("runs the synced local gate with locked dependencies and no autofix", () => {
    const { scripts } = JSON.parse(
      readFileSync(join(root, "package.json"), "utf8"),
    );
    expect(scripts["fallow:ci"]).toBe(
      "svelte-kit sync && node scripts/fallow-ci.ts",
    );
    const job = workflow.split("  fallow:\n")[1].split("  unit-tests:\n")[0];
    expect(job).toContain("run: pnpm install --frozen-lockfile");
    expect(job).toContain("node-version-file: .node_version");
    expect(job).toContain("cache: pnpm");
    expect(job).toContain("fetch-depth: 0");
    expect(job).toContain("run: pnpm fallow:ci");
    expect(job).toContain("contents: read");
    expect(job).toContain("path: .tmp-fallow-ci/");
    expect(job).not.toMatch(
      /continue-on-error|--fix|save-baseline|pull_request_target/,
    );
  });

  it("runs migration safety with full history and a required base revision", () => {
    const job = workflow.split("  migrations:\n")[1].split("  build:\n")[0];
    expect(job).toContain("fetch-depth: 0");
    expect(job).toContain(
      "MIGRATION_BASE_REF: ${{ github.event.pull_request.base.sha || github.event.before }}",
    );
    expect(job).toContain("run: pnpm db:verify");
    expect(job).toContain("run: pnpm install --frozen-lockfile");
    expect(job).not.toMatch(/continue-on-error|--remote|pull_request_target/);
  });

  it("requires all existing gates plus Fallow and migration safety and always evaluates the aggregate", () => {
    const needs = quality
      .split("    needs:\n")[1]
      .split("    if:")[0]
      .trim()
      .split("\n")
      .map((line) => line.trim().slice(2));
    expect(needs).toEqual(required);
    expect(quality).toContain("if: ${{ always() }}");
    const result = aggregate(
      Object.fromEntries(required.map((job) => [job, "success"])),
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
  });

  it.each(required)(
    "propagates failure, cancellation and skipping from %s",
    (job) => {
      for (const status of ["failure", "cancelled", "skipped"]) {
        const results = Object.fromEntries(
          required.map((requiredJob) => [requiredJob, "success"]),
        );
        results[job] = status;
        expect(aggregate(results).status).toBe(1);
      }
    },
  );

  it("keeps Fallow exact under Renovate without bypassing release age or major approval", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    const renovate = JSON.parse(
      readFileSync(join(root, "renovate.json"), "utf8"),
    );
    expect(pkg.devDependencies.fallow).toMatch(/^\d+\.\d+\.\d+$/);
    expect(renovate.extends).toContain("security:minimumReleaseAgeNpm");
    expect(renovate.packageRules).toContainEqual(
      expect.objectContaining({
        matchUpdateTypes: ["major"],
        dependencyDashboardApproval: true,
      }),
    );
    expect(renovate.packageRules).toContainEqual(
      expect.objectContaining({
        matchManagers: ["npm"],
        matchPackageNames: ["fallow"],
        rangeStrategy: "pin",
      }),
    );
    const workspace = readFileSync(join(root, "pnpm-workspace.yaml"), "utf8");
    expect(workspace).toMatch(/^minimumReleaseAge: 4320$/m);
    expect(workspace).not.toContain("minimumReleaseAgeExclude");
  });
});
