import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const script = resolve("scripts/e2e-apt-cache.sh");
const directories: string[] = [];
afterEach(() => {
  for (const path of directories.splice(0))
    rmSync(path, { recursive: true, force: true });
});
function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), "apt-cache-"));
  directories.push(cwd);
  const cache = join(cwd, ".tmp-e2e-apt-cache");
  mkdirSync(cache);
  const run = (args: string[], env = process.env) =>
    spawnSync("bash", [script, ...args], { cwd, env, encoding: "utf8" });
  return { cwd, cache, run };
}
function executable(path: string, code: string) {
  writeFileSync(path, `#!${process.execPath}\n${code}`);
  chmodSync(path, 0o755);
}
function installerFixture() {
  const f = fixture();
  const bin = join(f.cwd, "bin");
  mkdirSync(bin);
  const log = join(f.cwd, "calls.log");
  executable(
    join(bin, "sudo"),
    `
import { appendFileSync, copyFileSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
const args = process.argv.slice(2);
appendFileSync(process.env.APT_TEST_LOG, JSON.stringify(args) + '\\n');
if (args[0] === 'install') {
  const filtered = args.slice(1).filter((arg, i, all) => !['-o', '-g'].includes(arg) && !['-o', '-g'].includes(all[i - 1]));
  process.exit(spawnSync('/usr/bin/install', filtered).status);
}
if (args[0] !== 'env' || !args[1].startsWith('APT_CONFIG=')) process.exit(90);
const config = readFileSync(args[1].slice('APT_CONFIG='.length), 'utf8');
const archives = config.match(/Dir::Cache::archives "([^";]+)";/)[1];
if (args[2] === 'apt-config') {
  if (process.env.APT_TEST_MODE === 'config-mismatch') writeFileSync(args[1].slice('APT_CONFIG='.length), config.replace('Packages "true"', 'Packages "false"'));
  const result = spawnSync('/usr/bin/apt-config', args.slice(3), {env: {...process.env, APT_CONFIG:args[1].slice('APT_CONFIG='.length)}, encoding:'utf8'});
  process.stdout.write(result.stdout);
  process.exit(result.status);
} else {
  if (args.at(-2) !== 'install-deps' || args.at(-1) !== 'chromium') process.exit(91);
  if (readdirSync(archives).some(name => name.endsWith('.deb'))) process.exit(92);
  appendFileSync(process.env.APT_TEST_LOG, 'final-archives-empty\\n');
  if (process.env.APT_TEST_MODE === 'install-failure') process.exit(7);
  // Fixture acquisition only; native APT hash behavior is verified separately.
  for (const file of readdirSync(join(archives, 'partial'))) copyFileSync(join(archives, 'partial', file), join(archives, file));
  writeFileSync(join(archives, 'fonts-fixture_1.0_all.deb'), 'acquired');
}
`,
  );
  executable(join(bin, "node"), "console.log('/fixture/playwright-cli.js');");
  executable(
    join(bin, "pnpm"),
    "import {appendFileSync} from 'node:fs'; appendFileSync(process.env.APT_TEST_LOG, 'browser:' + process.argv.slice(2).join(' ') + '\\n');",
  );
  const run = (mode = "") =>
    f.run(["install"], {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      APT_TEST_LOG: log,
      APT_TEST_MODE: mode,
    });
  return { ...f, run, log: () => readFileSync(log, "utf8") };
}

describe("APT archive cache boundary", () => {
  it("accepts an empty cache and ordinary Debian archive names", () => {
    const f = fixture();
    expect(f.run(["validate", f.cache]).status).toBe(0);
    writeFileSync(join(f.cache, "fonts-fixture_1%3a2.0-1_all.deb"), "archive");
    expect(f.run(["validate", f.cache]).status).toBe(0);
  });
  it.each(["symlink", "directory", "unexpected", "directory-symlink"])(
    "rejects %s cache entries before any privileged action",
    (kind) => {
      const f = fixture();
      const path = join(f.cache, "fonts-fixture_1.0_all.deb");
      if (kind === "symlink") symlinkSync("/etc/passwd", path);
      else if (kind === "directory") mkdirSync(path);
      else if (kind === "unexpected")
        writeFileSync(join(f.cache, "config"), "bad");
      else {
        rmSync(f.cache, { recursive: true });
        symlinkSync(f.cwd, f.cache);
      }
      expect(f.run(["validate", f.cache]).status).not.toBe(0);
    },
  );
  it("rejects oversized archives without reading or installing their contents", () => {
    const f = fixture();
    const path = join(f.cache, "fonts-fixture_1.0_all.deb");
    writeFileSync(path, "");
    truncateSync(path, 1073741825);
    expect(f.run(["validate", f.cache]).status).not.toBe(0);
  });
  it.each([false, true])(
    "stages only partial files and exports acquired archives (warm=%s)",
    (warm) => {
      const f = installerFixture();
      if (warm)
        writeFileSync(join(f.cache, "libfixture_1.0_amd64.deb"), "cached");
      const result = f.run();
      expect(result.status, result.stderr).toBe(0);
      expect(f.log()).toContain("final-archives-empty");
      expect(f.log()).toContain(
        "browser:exec playwright install --only-shell chromium",
      );
      expect(existsSync(join(f.cache, "fonts-fixture_1.0_all.deb"))).toBe(true);
      if (warm)
        expect(f.log()).toContain("/archives/partial/libfixture_1.0_amd64.deb");
      expect(existsSync(join(f.cache, "partial"))).toBe(false);
      expect(existsSync(join(f.cache, "apt.conf"))).toBe(false);
    },
  );
  it.each(["config-mismatch", "install-failure"])(
    "fails closed on %s without browser installation or cache export",
    (mode) => {
      const f = installerFixture();
      expect(f.run(mode).status).not.toBe(0);
      expect(f.log()).not.toContain("browser:");
      expect(existsSync(join(f.cache, "fonts-fixture_1.0_all.deb"))).toBe(
        false,
      );
    },
  );
  it.each(["ci", "e2e"])(
    "caches only archives with an exact key in %s",
    (workflow) => {
      const text = readFileSync(`.github/workflows/${workflow}.yml`, "utf8");
      expect(text).toContain("uses: actions/cache@v6");
      expect(text).toContain("path: .tmp-e2e-apt-cache/*.deb");
      expect(text).toContain("key: ${{ steps.e2e-apt-key.outputs.key }}");
      expect(text).not.toContain("restore-keys:");
      expect(text).not.toContain("/var/lib/dpkg");
      expect(text).not.toContain("/var/cache/apt");
      expect(text).toContain("wait: [e2e-browser, e2e-build]");
    },
  );
});
