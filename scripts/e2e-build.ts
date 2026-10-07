import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const manifestPath = ".tmp-e2e-build.json";
const timingPath = ".tmp-e2e-timing.json";
const outputPaths = [
  ".svelte-kit/cloudflare",
  ".svelte-kit/cloudflare-tmp",
  ".svelte-kit/output",
];

export function e2eEnvironment() {
  return {
    COREPACK_HOME: "/tmp/corepack",
    PNPM_HOME: "/tmp/pnpm",
    XDG_DATA_HOME: "/tmp",
    XDG_CONFIG_HOME: `${process.cwd()}/.tmp-xdg-config`,
    YOSAN_FLOW_E2E_RESET_TOKEN: "local-e2e-reset-token",
  };
}

function identity() {
  if (process.env.CI !== "true" || process.env.GITHUB_ACTIONS !== "true") {
    throw new Error("Prebuilt E2E is restricted to GitHub Actions CI");
  }
  const keys = [
    "GITHUB_SHA",
    "GITHUB_RUN_ID",
    "GITHUB_RUN_ATTEMPT",
    "GITHUB_JOB",
  ];
  const run = Object.fromEntries(
    keys.map((key) => {
      const value = process.env[key];
      if (!value) throw new Error(`Missing CI build identity: ${key}`);
      return [key, value];
    }),
  );
  const head = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  if (head !== run.GITHUB_SHA)
    throw new Error("Prebuilt E2E checkout differs from GITHUB_SHA");
  execFileSync("git", ["diff", "--quiet", "HEAD", "--"]);
  const untracked = execFileSync(
    "git",
    ["ls-files", "--others", "--exclude-standard"],
    { encoding: "utf8" },
  );
  if (untracked.trim())
    throw new Error(
      "Prebuilt E2E requires a clean checkout without untracked inputs",
    );
  if (
    readdirSync(".").some(
      (name) =>
        /^(\.env(?:\.|$)|\.dev\.vars(?:\.|$))/.test(name) &&
        !name.endsWith(".example"),
    )
  ) {
    throw new Error("Prebuilt E2E does not accept local environment files");
  }
  const environment = Object.fromEntries(
    Object.entries({ ...process.env, ...e2eEnvironment() })
      .filter(
        ([key]) =>
          /^(VITE_|PUBLIC_|YOSAN_FLOW_|CLOUDFLARE_|WRANGLER_|NODE_ENV$)/.test(
            key,
          ) && key !== "YOSAN_FLOW_E2E_PREBUILT",
      )
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  return { run, cwd: resolve("."), node: process.version, environment };
}

function outputDigest() {
  // Hash all served assets as well as the Worker, and reject missing output.
  readFileSync(".svelte-kit/cloudflare/_worker.js");
  readFileSync(".svelte-kit/cloudflare-tmp/server.js");
  readFileSync(".svelte-kit/output/server/index.js");
  const hash = createHash("sha256");
  function visit(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
      (a, b) => a.name.localeCompare(b.name),
    )) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile())
        hash.update(path).update("\0").update(readFileSync(path)).update("\0");
      else throw new Error(`Unexpected E2E build output: ${path}`);
    }
  }
  for (const path of outputPaths) visit(path);
  return hash.digest("hex");
}

function buildE2E() {
  rmSync(manifestPath, { force: true });
  const buildIdentity = identity();
  // A failed build must never leave an old output eligible for reuse.
  for (const path of outputPaths)
    rmSync(path, { recursive: true, force: true });
  const buildStartedAt = Date.now();
  writeFileSync(timingPath, JSON.stringify({ buildStartedAt }));
  execFileSync("pnpm", ["build"], {
    stdio: "inherit",
    env: { ...process.env, ...e2eEnvironment() },
  });
  const buildCompletedAt = Date.now();
  writeFileSync(
    manifestPath,
    JSON.stringify({
      identity: buildIdentity,
      digest: outputDigest(),
      buildStartedAt,
      buildCompletedAt,
    }),
  );
  writeFileSync(
    timingPath,
    JSON.stringify({ buildStartedAt, buildCompletedAt }),
  );
}

function verifyE2EBuild() {
  const current = identity();
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const timing = JSON.parse(readFileSync(timingPath, "utf8"));
  if (
    JSON.stringify(current) !== JSON.stringify(manifest.identity) ||
    outputDigest() !== manifest.digest
  ) {
    throw new Error("Prebuilt E2E identity or output does not match this job");
  }
  if (
    !Number.isFinite(manifest.buildStartedAt) ||
    !Number.isFinite(manifest.buildCompletedAt) ||
    manifest.buildCompletedAt < manifest.buildStartedAt ||
    timing.buildStartedAt !== manifest.buildStartedAt ||
    timing.buildCompletedAt !== manifest.buildCompletedAt ||
    timing.readyObservedAt !== undefined
  ) {
    throw new Error("Prebuilt E2E timing is missing, stale or inconsistent");
  }
}

if (import.meta.main) {
  if (process.argv[2] === "build") buildE2E();
  else if (process.argv[2] === "verify") verifyE2EBuild();
  else throw new Error("Expected build or verify");
}
