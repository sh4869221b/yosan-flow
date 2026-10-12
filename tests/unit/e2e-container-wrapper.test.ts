import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";

const fixtures: string[] = [];
function fixture() {
  const cwd = mkdtempSync(join(process.cwd(), ".tmp-container-wrapper-"));
  fixtures.push(cwd);
  mkdirSync(join(cwd, "scripts"));
  mkdirSync(join(cwd, "tooling/ci/container"), { recursive: true });
  for (const file of [
    "scripts/e2e-container.sh",
    "scripts/e2e-container-config.ts",
    "tooling/ci/container/image.json",
    "tooling/ci/container/Dockerfile",
    "tooling/ci/container/fonts.conf",
    "pnpm-lock.yaml",
    ".node_version",
  ])
    copyFileSync(file, join(cwd, file));
  execFileSync("git", ["init", "--quiet"], { cwd });
  const bin = join(cwd, "bin");
  mkdirSync(bin);
  const docker = join(bin, "docker");
  writeFileSync(
    docker,
    `#!/usr/bin/env python3\nimport sys,json\nif sys.argv[1:3]==['image','inspect']:print('sha256:fixture');sys.exit(0)\nif sys.argv[1]=='run':open('docker-args.json','w').write(json.dumps(sys.argv[1:]));sys.exit(0)\nsys.exit(7)\n`,
  );
  chmodSync(docker, 0o755);
  return {
    cwd,
    run: (args: string[]) =>
      spawnSync("bash", ["scripts/e2e-container.sh", ...args], {
        cwd,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          CLOUDFLARE_API_TOKEN: "secret-fixture-not-forwarded",
          VITE_TEST_SECRET: "another-secret-not-forwarded",
        },
      }),
  };
}
afterEach(() => {
  for (const cwd of fixtures.splice(0))
    rmSync(cwd, { recursive: true, force: true });
});

it("passes filters literally, supports a full local suite and excludes cloud/app credentials", () => {
  const f = fixture();
  const pattern = "budget $(touch should-not-execute)";
  const result = f.run(["--shard=1/2", "--grep", pattern]);
  expect(result.status, result.stderr).toBe(0);
  const args: string[] = JSON.parse(
    readFileSync(join(f.cwd, "docker-args.json"), "utf8"),
  );
  expect(args.slice(-5)).toEqual([
    "bash",
    "scripts/e2e-container-inner.sh",
    "--shard=1/2",
    "--grep",
    pattern,
  ]);
  expect(args.join(" ")).not.toMatch(
    /CLOUDFLARE_API_TOKEN|VITE_TEST_SECRET|secret-fixture|another-secret/,
  );
  expect(f.run([]).status).toBe(0);
});
it("rejects local env before invoking Docker without leaking its value", () => {
  const f = fixture();
  writeFileSync(join(f.cwd, ".dev.vars"), "private-value-never-log");
  const result = f.run([]);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("clean worktree");
  expect(result.stderr).not.toContain("private-value-never-log");
});
