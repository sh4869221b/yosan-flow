import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const script = resolve("scripts/e2e-build.ts");
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), "e2e-build-"));
  directories.push(cwd);
  const bin = join(cwd, "bin");
  mkdirSync(bin);
  const pnpm = join(bin, "pnpm");
  writeFileSync(
    pnpm,
    '#!/bin/sh\n[ "$1" = build ] || exit 9\n[ "$E2E_TEST_FAIL_BUILD" != 1 ] || exit 7\nmkdir -p .svelte-kit/cloudflare .svelte-kit/cloudflare-tmp .svelte-kit/output/server\nprintf worker > .svelte-kit/cloudflare/_worker.js\nprintf asset > .svelte-kit/cloudflare/asset.js\nprintf server > .svelte-kit/cloudflare-tmp/server.js\nprintf index > .svelte-kit/output/server/index.js\n',
  );
  chmodSync(pnpm, 0o755);
  const git = (args: string[]) =>
    execFileSync("git", args, { cwd, encoding: "utf8" });
  git(["init", "--quiet"]);
  writeFileSync(join(cwd, "source.txt"), "source");
  writeFileSync(
    join(cwd, ".gitignore"),
    "bin/\n.svelte-kit/\n.tmp-*\n.env*\n.dev.vars*\n",
  );
  git(["add", "source.txt", ".gitignore"]);
  git([
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "--quiet",
    "-m",
    "fixture",
  ]);
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    CI: "true",
    GITHUB_ACTIONS: "true",
    GITHUB_SHA: git(["rev-parse", "HEAD"]).trim(),
    GITHUB_RUN_ID: "123",
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_JOB: "e2e-shard-1",
  };
  const run = (command: string, overrides: NodeJS.ProcessEnv = {}) =>
    spawnSync(process.execPath, [script, command], {
      cwd,
      env: { ...env, ...overrides },
      encoding: "utf8",
    });
  const read = (path: string) =>
    JSON.parse(readFileSync(join(cwd, path), "utf8"));
  const write = (path: string, value: unknown) =>
    writeFileSync(join(cwd, path), JSON.stringify(value));
  return { cwd, run, read, write };
}

describe("CI-only E2E prebuild", () => {
  it("accepts the same job's completed build and preserves the original build timing", () => {
    const f = fixture();
    expect(f.run("build").status).toBe(0);
    const timing = f.read(".tmp-e2e-timing.json");
    expect(timing.buildCompletedAt).toBeGreaterThanOrEqual(
      timing.buildStartedAt,
    );
    expect(f.run("verify", { YOSAN_FLOW_E2E_PREBUILT: "1" }).status).toBe(0);
    expect(f.read(".tmp-e2e-timing.json")).toEqual(timing);
  });

  it.each([
    { CI: "" },
    { GITHUB_ACTIONS: "" },
    { GITHUB_SHA: "" },
    { GITHUB_SHA: "0".repeat(40) },
    { GITHUB_RUN_ID: "456" },
    { GITHUB_RUN_ATTEMPT: "2" },
    { GITHUB_JOB: "e2e-shard-2" },
    { NODE_ENV: "changed" },
    { PUBLIC_BUILD_MODE: "changed" },
  ])("rejects another run, checkout or build environment: %j", (overrides) => {
    const f = fixture();
    expect(f.run("build").status).toBe(0);
    expect(f.run("verify", overrides).status).not.toBe(0);
  });

  it.each([
    ".svelte-kit/cloudflare/_worker.js",
    ".svelte-kit/cloudflare/asset.js",
    ".svelte-kit/cloudflare-tmp/server.js",
    ".svelte-kit/output/server/index.js",
    "source.txt",
  ])("rejects changed output or source: %s", (path) => {
    const f = fixture();
    expect(f.run("build").status).toBe(0);
    writeFileSync(join(f.cwd, path), "changed");
    expect(f.run("verify").status).not.toBe(0);
  });

  it.each([
    ".tmp-e2e-build.json",
    ".tmp-e2e-timing.json",
    ".svelte-kit/cloudflare/_worker.js",
    ".svelte-kit/cloudflare-tmp/server.js",
    ".svelte-kit/output/server/index.js",
  ])("rejects missing evidence: %s", (path) => {
    const f = fixture();
    expect(f.run("build").status).toBe(0);
    rmSync(join(f.cwd, path));
    expect(f.run("verify").status).not.toBe(0);
  });

  it.each([
    { buildStartedAt: 0 },
    { buildCompletedAt: 0 },
    { readyObservedAt: 123 },
  ])("rejects overwritten or consumed timing: %j", (changes) => {
    const f = fixture();
    expect(f.run("build").status).toBe(0);
    f.write(".tmp-e2e-timing.json", {
      ...f.read(".tmp-e2e-timing.json"),
      ...changes,
    });
    expect(f.run("verify").status).not.toBe(0);
  });

  it.each(["untracked-source.ts", ".env.local", ".dev.vars"])(
    "rejects added build inputs: %s",
    (path) => {
      const f = fixture();
      expect(f.run("build").status).toBe(0);
      writeFileSync(join(f.cwd, path), "changed");
      expect(f.run("verify").status).not.toBe(0);
    },
  );

  it.each(["cwd", "node"])(
    "rejects a changed manifest identity: %s",
    (field) => {
      const f = fixture();
      expect(f.run("build").status).toBe(0);
      const manifest = f.read(".tmp-e2e-build.json");
      manifest.identity[field] = "changed";
      f.write(".tmp-e2e-build.json", manifest);
      expect(f.run("verify").status).not.toBe(0);
    },
  );

  it("rejects malformed evidence", () => {
    const f = fixture();
    expect(f.run("build").status).toBe(0);
    writeFileSync(join(f.cwd, ".tmp-e2e-build.json"), "{");
    expect(f.run("verify").status).not.toBe(0);
  });

  it("invalidates previous success before a failed build, without falling back to old output", () => {
    const f = fixture();
    expect(f.run("build").status).toBe(0);
    expect(f.run("build", { E2E_TEST_FAIL_BUILD: "1" }).status).toBe(1);
    expect(f.run("verify").status).not.toBe(0);
  });
});

describe("E2E setup workflow contract", () => {
  it.each(["ci", "e2e"])(
    "waits for successful browser install and same-job build in %s",
    (workflow) => {
      const text = readFileSync(`.github/workflows/${workflow}.yml`, "utf8");
      expect(text).toContain("run: bash scripts/e2e-apt-cache.sh install");
      expect(text).toMatch(/id: e2e-browser\n\s+background: true/);
      expect(text).toMatch(
        /id: e2e-build\n\s+background: true\n\s+run: node scripts\/e2e-build.ts build/,
      );
      expect(text).toContain("wait: [e2e-browser, e2e-build]");
      expect(text.indexOf("run: pnpm install --frozen-lockfile")).toBeLessThan(
        text.indexOf("id: e2e-browser"),
      );
      expect(text.indexOf("wait: [e2e-browser, e2e-build]")).toBeLessThan(
        text.indexOf('YOSAN_FLOW_E2E_PREBUILT: "1"'),
      );
      expect(text).not.toContain("continue-on-error");
      expect(text).toMatch(/pnpm test:e2e --shard=.+\/2/);
    },
  );

  it("keeps local builds, isolated D1 migrations and single-worker serial execution", () => {
    const config = resolve("playwright.config.ts");
    const load = (prebuilt: string) =>
      spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `import config from ${JSON.stringify(config)}; console.log(JSON.stringify(config))`,
        ],
        {
          env: { ...process.env, YOSAN_FLOW_E2E_PREBUILT: prebuilt },
          encoding: "utf8",
        },
      );
    for (const prebuilt of ["", "1"]) {
      const result = load(prebuilt);
      expect(result.status, result.stderr).toBe(0);
      const config = JSON.parse(result.stdout);
      expect(config.workers).toBe(1);
      expect(config.fullyParallel).toBe(false);
      expect(config.webServer.reuseExistingServer).toBe(false);
      expect(config.webServer.command).toContain(
        "wrangler d1 migrations apply DB --local --persist-to",
      );
      expect(config.webServer.command).toContain(
        "wrangler dev --local --persist-to",
      );
      if (prebuilt) {
        expect(config.webServer.command).toContain(
          "scripts/e2e-build.ts verify",
        );
        expect(config.webServer.command).not.toContain("pnpm build");
        expect(config.webServer.command).not.toContain(
          "scripts/e2e-timing.ts start",
        );
      } else {
        expect(config.webServer.command).toContain(
          "scripts/e2e-timing.ts start",
        );
        expect(config.webServer.command).toContain("pnpm build");
      }
    }
  });
});
