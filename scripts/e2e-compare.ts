import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { lockedPlaywright } from "./e2e-container-config.ts";

const directory = ".tmp-e2e-compare";
mkdirSync(directory, { recursive: true });
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const write = (name: string, value: unknown) =>
  writeFileSync(join(directory, name), JSON.stringify(value, null, 2));
const execute = (command: string, args: string[]) =>
  execFileSync(command, args, { encoding: "utf8" }).trim();

function selection() {
  const method = process.env.E2E_METHOD;
  const shard = process.env.E2E_SHARD;
  assert.ok(method === "nix" || method === "container");
  assert.ok(shard === "1" || shard === "2");
  return { method, shard };
}

function source() {
  const sha = execute("git", ["rev-parse", "HEAD"]);
  assert.equal(
    sha,
    process.env.GITHUB_SHA,
    "Benchmark checkout differs from event SHA",
  );
  return {
    sha,
    lockHash: hash("pnpm-lock.yaml"),
    nodeVersion: readFileSync(".node_version", "utf8").trim(),
    packageManager: read("package.json").packageManager,
    playwrightVersion: lockedPlaywright(readFileSync("pnpm-lock.yaml", "utf8")),
    imageConfigHash: hash("tooling/ci/container/image.json"),
    ...selection(),
  };
}

function measure(stage: string, command: string, args: string[]) {
  assert.match(stage, /^[a-z0-9-]+$/);
  const startedAt = Date.now();
  const result = spawnSync(command, args, { stdio: "inherit" });
  write(`${stage}-timing.json`, {
    stage,
    startedAt,
    completedAt: Date.now(),
    status: result.status,
    signal: result.signal,
    error: result.error?.message,
  });
  assert.ifError(result.error);
  process.exitCode = result.status ?? 1;
}

function runner() {
  const keys = [
    "ImageOS",
    "ImageVersion",
    "RUNNER_OS",
    "RUNNER_ARCH",
    "GITHUB_RUN_ID",
    "GITHUB_RUN_ATTEMPT",
    "GITHUB_JOB",
    "E2E_PHASE",
  ];
  write("runner.json", {
    ...source(),
    environment: Object.fromEntries(
      keys.map((key) => [key, process.env[key] ?? null]),
    ),
    cpu: execute("lscpu", ["--json"]),
    disk: execute("df", ["-B1", "."]),
    nixPolicy:
      "cache.nixos.org; require-sigs true; recursive verify sigs-needed 1; builders empty; max-jobs 0",
    transport:
      "isolated artifact snapshot; repository Actions caches untouched",
  });
}

function installed() {
  const expected = source();
  assert.equal(process.version, `v${expected.nodeVersion}`);
  assert.equal(
    execute("pnpm", ["--version"]),
    expected.packageManager.slice(5),
  );
  const require = createRequire(import.meta.url);
  const testRequire = createRequire(
    require.resolve("@playwright/test/package.json"),
  );
  const coreRequire = createRequire(
    testRequire.resolve("playwright/package.json"),
  );
  const versions = [
    require.resolve("@playwright/test/package.json"),
    testRequire.resolve("playwright/package.json"),
    coreRequire.resolve("playwright-core/package.json"),
  ].map((path) => read(path).version);
  for (const version of versions)
    assert.equal(version, expected.playwrightVersion);
  const kitPackage = require.resolve("@sveltejs/kit/package.json");
  const kitCli = join(dirname(kitPackage), read(kitPackage).bin["svelte-kit"]);
  const testPackage = require.resolve("@playwright/test/package.json");
  const testCli = join(dirname(testPackage), read(testPackage).bin.playwright);
  execFileSync(process.execPath, [kitCli, "sync"], { stdio: "inherit" });
  const inventory = JSON.parse(
    execFileSync(
      process.execPath,
      [testCli, "test", "--list", "--reporter=json"],
      { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
    ),
  );
  type Suite = { specs: { tests: unknown[] }[]; suites: Suite[] };
  function count(suites: Suite[]): number {
    return suites.reduce(
      (total, suite) =>
        total +
        (suite.specs ?? []).reduce((n, spec) => n + spec.tests.length, 0) +
        count(suite.suites ?? []),
      0,
    );
  }
  assert.equal(
    count(inventory.suites),
    143,
    "Benchmark test inventory changed",
  );
  write("installed.json", {
    ...expected,
    node: process.version,
    cwd: process.cwd(),
    versions,
    tests: 143,
    workers: 1,
  });
}

function cacheSave() {
  const startedAt = Date.now();
  const cache = join(directory, "cache");
  mkdirSync(cache, { recursive: true });
  const files = ["pnpm.tar.zst"];
  execFileSync("tar", [
    "-I",
    "zstd",
    "-cpf",
    join(cache, files[0]),
    ".tmp-container-store",
  ]);
  if (selection().method === "nix") {
    files.push("nix.tar.zst", "evaluation.tar.zst");
    execFileSync("tar", [
      "-I",
      "zstd",
      "-cpf",
      join(process.cwd(), cache, "nix.tar.zst"),
      "-C",
      "/",
      "nix",
    ]);
    execFileSync("tar", [
      "-I",
      "zstd",
      "-cpf",
      join(process.cwd(), cache, "evaluation.tar.zst"),
      "-C",
      process.env.HOME!,
      ".cache/nix",
    ]);
  } else {
    files.push("image.tar.gz");
    renameSync(
      ".tmp-container-cache/image.tar.gz",
      join(cache, "image.tar.gz"),
    );
  }
  const archives = files.map((name) => ({
    name,
    bytes: statSync(join(cache, name)).size,
    sha256: hash(join(cache, name)),
  }));
  writeFileSync(
    join(cache, "manifest.json"),
    JSON.stringify({ source: source(), archives }, null, 2),
  );
  write("cache-save-timing.json", {
    startedAt,
    completedAt: Date.now(),
    status: 0,
    archives,
  });
}

function cacheRestore() {
  const startedAt = Date.now();
  const cache = join(directory, "cache");
  const manifest = read(join(cache, "manifest.json"));
  assert.deepEqual(
    manifest.source,
    source(),
    "Snapshot source/method/shard differs",
  );
  for (const archive of manifest.archives) {
    assert.ok(
      [
        "pnpm.tar.zst",
        "nix.tar.zst",
        "evaluation.tar.zst",
        "image.tar.gz",
      ].includes(archive.name),
    );
    assert.equal(
      hash(join(cache, archive.name)),
      archive.sha256,
      "Snapshot integrity differs",
    );
  }
  execFileSync("tar", ["-I", "zstd", "-xpf", join(cache, "pnpm.tar.zst")]);
  if (selection().method === "nix") {
    execFileSync("tar", [
      "-I",
      "zstd",
      "-xpf",
      join(process.cwd(), cache, "nix.tar.zst"),
      "-C",
      "/",
    ]);
    execFileSync("tar", [
      "-I",
      "zstd",
      "-xpf",
      join(process.cwd(), cache, "evaluation.tar.zst"),
      "-C",
      process.env.HOME!,
    ]);
  } else {
    mkdirSync(".tmp-container-cache", { recursive: true });
    renameSync(
      join(cache, "image.tar.gz"),
      ".tmp-container-cache/image.tar.gz",
    );
  }
  write("cache-restore-timing.json", {
    startedAt,
    completedAt: Date.now(),
    status: 0,
    archives: manifest.archives,
  });
}

function sizes() {
  const paths =
    selection().method === "nix"
      ? ["/nix", `${process.env.HOME}/.cache/nix`, ".tmp-container-store"]
      : [".tmp-container-cache", ".tmp-container-store"];
  write("capacity.json", {
    ...source(),
    diskBytes: paths.map((path) => ({
      path,
      bytes: Number(execute("du", ["-sb", path]).split(/\s/)[0]),
    })),
  });
}

type Case = { phase: string; method: string; shard: string };
type Job = {
  name: string;
  conclusion: string;
  started_at: string;
  completed_at: string;
  steps: unknown[];
};

function comparisonRow(root: string, jobs: Job[], item: Case) {
  const { phase, method, shard } = item;
  const path = join(root, `${phase}-${method}-${shard}`);
  const metadata = read(join(path, directory, "runner.json"));
  const runtime = read(join(path, directory, "installed.json"));
  const stats = read(join(path, "test-results/results.json")).stats;
  const job = jobs.find(
    (job) => job.name === `Compare ${phase} ${method} (shard ${shard}/2)`,
  );
  assert.ok(job && job.conclusion === "success", "Incomplete benchmark job");
  assert.equal(metadata.method, method);
  assert.equal(metadata.shard, shard);
  assert.equal(metadata.environment.E2E_PHASE, phase);
  assert.equal(runtime.method, method);
  assert.equal(runtime.shard, shard);
  assert.equal(runtime.sha, metadata.sha);
  assert.equal(runtime.lockHash, metadata.lockHash);
  assert.equal(runtime.node, `v${metadata.nodeVersion}`);
  assert.equal(runtime.tests, 143);
  assert.equal(runtime.workers, 1);
  assert.ok(
    metadata.environment.ImageOS &&
      metadata.environment.ImageVersion &&
      metadata.environment.RUNNER_ARCH,
    "Missing runner image identity",
  );
  assert.equal(stats.expected, shard === "1" ? 82 : 61);
  for (const key of ["unexpected", "flaky", "skipped"])
    assert.equal(stats[key], 0);
  return {
    ...item,
    stats,
    metadata,
    runtime,
    jobSeconds:
      (Date.parse(job.completed_at) - Date.parse(job.started_at)) / 1000,
    steps: job.steps,
  };
}

export function comparisonRows(root: string, jobsPath: string) {
  const jobs: Job[] = read(jobsPath).jobs;
  const cases = ["cold", "warm"].flatMap((phase) =>
    ["nix", "container"].flatMap((method) =>
      ["1", "2"].map((shard) => ({ phase, method, shard })),
    ),
  );
  const rows = cases.map((item) => comparisonRow(root, jobs, item));
  const identities = new Set(
    rows.map(({ metadata, runtime }) =>
      JSON.stringify([
        metadata.sha,
        metadata.lockHash,
        runtime.node,
        runtime.versions,
        runtime.tests,
        runtime.workers,
      ]),
    ),
  );
  const images = new Set(
    rows.map(({ metadata }) =>
      JSON.stringify([
        metadata.environment.ImageOS,
        metadata.environment.ImageVersion,
        metadata.environment.RUNNER_ARCH,
      ]),
    ),
  );
  assert.equal(
    identities.size,
    1,
    "Source/dependencies/conditions differ across jobs",
  );
  assert.equal(
    images.size,
    1,
    "Hosted runner images differ; do not compare directly",
  );
  return rows;
}

function summarize(root: string, jobsPath: string) {
  const rows = comparisonRows(root, jobsPath);
  write("summary.json", rows);
  const lines = [
    "## Nix/container hosted comparison",
    "",
    "Same push SHA, locked dependencies, 143 tests, 2 shards, 1 worker; isolated artifact snapshots.",
    "",
    "| Phase | Method | Shard | Job seconds | Playwright seconds | Expected |",
    "| --- | --- | --- | ---: | ---: | ---: |",
    ...rows.map(
      (r) =>
        `| ${r.phase} | ${r.method} | ${r.shard}/2 | ${r.jobSeconds.toFixed(1)} | ${(r.stats.duration / 1000).toFixed(1)} | ${r.stats.expected} |`,
    ),
  ];
  appendFileSync(process.env.GITHUB_STEP_SUMMARY!, `${lines.join("\n")}\n`);
}

if (import.meta.main) {
  const [command, ...args] = process.argv.slice(2);
  if (command === "runner") runner();
  else if (command === "installed") installed();
  else if (command === "cache-save") cacheSave();
  else if (command === "cache-restore") cacheRestore();
  else if (command === "sizes") sizes();
  else if (command === "exec") measure(args[0], args[1], args.slice(2));
  else if (command === "summary") summarize(args[0], args[1]);
  else throw new Error("Unknown E2E comparison command");
}
