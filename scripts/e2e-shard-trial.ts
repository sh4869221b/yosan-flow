import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, totalmem } from "node:os";
import { join } from "node:path";
import { summarizeReport } from "./e2e-summary.ts";

type Result = { status: string; retry: number; errors: unknown[] };
type Entry = {
  expectedStatus: string;
  projectName: string;
  status: string;
  results: Result[];
};
type Suite = {
  specs: { id: string; tests: Entry[] }[];
  suites?: Suite[];
};
type Report = {
  errors: unknown[];
  suites: Suite[];
  config: {
    workers: number;
    fullyParallel: boolean;
    shard: { current: number; total: number } | null;
    projects: { repeatEach: number; retries: number }[];
  };
};

function inventory(value: unknown, executed: boolean): string[] {
  const report = value as Report;
  assert.deepEqual(report.errors, [], "Report contains errors");
  assert.equal(report.config.workers, 1);
  assert.equal(report.config.fullyParallel, false);
  assert.ok(report.config.projects.length > 0);
  for (const project of report.config.projects) {
    assert.equal(project.repeatEach, 1);
    assert.equal(project.retries, 0);
  }
  const ids: string[] = [];
  function visit(suite: Suite) {
    for (const spec of suite.specs) {
      assert.equal(typeof spec.id, "string");
      assert.ok(spec.id.length > 0);
      for (const test of spec.tests) {
        assert.equal(test.expectedStatus, "passed");
        assert.equal(typeof test.projectName, "string");
        ids.push(JSON.stringify([spec.id, test.projectName]));
        if (executed) {
          assert.equal(test.status, "expected");
          assert.equal(test.results.length, 1, "Expected exactly one attempt");
          assert.equal(test.results[0].status, "passed");
          assert.equal(test.results[0].retry, 0);
          assert.deepEqual(test.results[0].errors, []);
        } else assert.deepEqual(test.results, []);
      }
    }
    for (const child of suite.suites ?? []) visit(child);
  }
  for (const suite of report.suites) visit(suite);
  assert.ok(ids.length > 0, "Empty test inventory");
  assert.equal(new Set(ids).size, ids.length, "Duplicate tests");
  if (executed) {
    assert.deepEqual(summarizeReport(value).counts, {
      expected: ids.length,
      failed: 0,
      flaky: 0,
      skipped: 0,
    });
  }
  return ids.sort();
}

export function verifyPartition(full: unknown, shards: unknown[]) {
  const expected = inventory(full, false);
  assert.equal((full as Report).config.shard, null);
  assert.ok([2, 3, 4].includes(shards.length));
  const actual = shards.flatMap((report, index) => {
    assert.deepEqual((report as Report).config.shard, {
      current: index + 1,
      total: shards.length,
    });
    return inventory(report, true);
  });
  assert.equal(
    new Set(actual).size,
    actual.length,
    "Duplicate tests across shards",
  );
  assert.deepEqual(
    actual.sort(),
    expected,
    "Shard union differs from full inventory",
  );
  return expected.length;
}

function read(path: string) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function recordRunner() {
  const sha = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  assert.equal(sha, process.env.GITHUB_SHA);
  const runner = {
    sha,
    platform: process.platform,
    arch: process.arch,
    cpuModel: cpus()[0].model,
    logicalCpus: cpus().length,
    memoryBytes: totalmem(),
    imageOS: process.env.ImageOS,
    imageVersion: process.env.ImageVersion,
  };
  mkdirSync(".tmp-shard-trial", { recursive: true });
  writeFileSync(
    ".tmp-shard-trial/runner.json",
    JSON.stringify(runner, null, 2),
  );
}

type Job = {
  name: string;
  status: string;
  conclusion: string;
  started_at: string;
  completed_at: string;
};

function completedJob(jobs: Job[], name: string) {
  const matches = jobs.filter((job) => job.name === name);
  assert.equal(matches.length, 1, `Missing or ambiguous job: ${name}`);
  const job = matches[0];
  assert.equal(job.status, "completed");
  assert.equal(job.conclusion, "success");
  const start = Date.parse(job.started_at);
  const end = Date.parse(job.completed_at);
  assert.ok(Number.isFinite(start) && Number.isFinite(end) && end >= start);
  return { start, end, duration: end - start };
}

function trialGroup(root: string, prefix: string, total: number, jobs: Job[]) {
  const seed = join(root, `${prefix}-inventory`);
  const full = read(join(seed, "test-results/results.json"));
  const manifest = read(join(seed, ".tmp-container-e2e/manifest.json"));
  const reports: unknown[] = [];
  const measurements = [];
  for (let shard = 1; shard <= total; shard++) {
    const dir = join(root, `${prefix}-${total}-${shard}`);
    const runner = read(join(dir, ".tmp-shard-trial/runner.json"));
    assert.equal(runner.sha, process.env.GITHUB_SHA, "Different source SHA");
    assert.deepEqual(
      read(join(dir, ".tmp-container-e2e/manifest.json")),
      manifest,
    );
    const report = read(join(dir, "test-results/results.json"));
    reports.push(report);
    const timing = summarizeReport(report);
    const job = completedJob(jobs, `Trial E2E (${shard}/${total})`);
    measurements.push({
      shard,
      ...job,
      runner,
      tests: timing.total,
      playwrightMs: timing.duration,
    });
  }
  const tests = verifyPartition(full, reports);
  const seedRunner = read(join(seed, ".tmp-shard-trial/runner.json"));
  assert.equal(seedRunner.sha, process.env.GITHUB_SHA);
  const ready = completedJob(jobs, "Prepare trial inventory and cache").end;
  const starts = measurements.map((item) => item.start);
  const end = Math.max(...measurements.map((item) => item.end));
  return {
    shards: total,
    tests,
    readyMs: end - ready,
    envelopeMs: end - Math.min(...starts),
    startSkewMs: Math.max(...starts) - Math.min(...starts),
    runnerMs: measurements.reduce((sum, item) => sum + item.duration, 0),
    measurements,
  };
}

function summarizeTrial(root: string, prefix: string) {
  const jobs = read(join(root, "jobs.json")).jobs as Job[];
  const groups = [2, 3, 4].map((total) =>
    trialGroup(root, prefix, total, jobs),
  );
  const result = {
    sha: process.env.GITHUB_SHA,
    run: process.env.GITHUB_RUN_ID,
    attempt: process.env.GITHUB_RUN_ATTEMPT,
    groups,
  };
  writeFileSync(join(root, "results.json"), JSON.stringify(result, null, 2));
  const seconds = (ms: number) => (ms / 1000).toFixed(3);
  console.log(
    [
      "## E2E shard trial",
      "",
      `Frozen SHA: ${result.sha}; run ${result.run}, attempt ${result.attempt}.`,
      "",
      "| Shards | Tests | Seed completion → all E2E jobs complete (s) | Job envelope (s) | Start skew (s) | Summed E2E runner time (s) |",
      "| ---: | ---: | ---: | ---: | ---: | ---: |",
      ...groups.map(
        (g) =>
          `| ${g.shards} | ${g.tests} | ${seconds(g.readyMs)} | ${seconds(g.envelopeMs)} | ${seconds(g.startSkewMs)} | ${seconds(g.runnerMs)} |`,
      ),
      "",
      "Each partition equals the complete unsharded inventory, without duplicates, failed/flaky/skipped tests or retries. All shards keep one worker and independent runner-local D1 state.",
      "",
      "All groups restore the same prepared dependency/font cache and pull cold Docker images. Readiness includes scheduling after the shared seed; envelopes exclude initial queue and the aggregate job. Summed runner time is not wall time or a billing amount. This isolated E2E experiment does not measure normal CI Quality checks completion. See retained reports and runner metadata for variation.",
    ].join("\n"),
  );
}

if (import.meta.main) {
  if (process.argv[2] === "record") recordRunner();
  else {
    assert.equal(process.argv[2], "summary");
    assert.ok(process.argv[3] && process.argv[4]);
    summarizeTrial(process.argv[3], process.argv[4]);
  }
}
