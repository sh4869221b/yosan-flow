import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

it("bootstraps Nix tools before project dependencies exist", () => {
  // Outside the repository so package resolution cannot find its node_modules.
  const cwd = mkdtempSync(join(tmpdir(), "yosan-nix-tools-"));
  try {
    const bundle = join(cwd, "bundle");
    const native = join(cwd, "native");
    mkdirSync(join(cwd, ".tmp-nix-e2e"));
    mkdirSync(join(bundle, "dist"), { recursive: true });
    mkdirSync(native);
    for (const [path, name] of [
      [bundle, "pnpm"],
      [native, "@pnpm/exe.linux-x64"],
    ])
      writeFileSync(
        join(path, "package.json"),
        JSON.stringify({ name, version: "0.0.0" }),
      );
    writeFileSync(join(native, "pnpm"), '#!/bin/sh\nprintf "0.0.0\\n"\n');
    const entries = [bundle, native].map((path) => {
      const archive = `${path}.tgz`;
      execFileSync("tar", [
        "-czf",
        archive,
        "-C",
        cwd,
        path.split("/").at(-1)!,
      ]);
      return `sha512-${createHash("sha512").update(readFileSync(archive)).digest("base64")}`;
    });
    writeFileSync(
      join(cwd, "package.json"),
      JSON.stringify({ packageManager: "pnpm@0.0.0" }),
    );
    writeFileSync(
      join(cwd, "pnpm-lock.yaml"),
      `---\nlockfileVersion: '9.0'\n\nimporters:\n\n  .:\n    configDependencies: {}\n    packageManagerDependencies:\n      pnpm:\n        specifier: 0.0.0\n        version: 0.0.0\n\npackages:\n\n  pnpm@0.0.0:\n    resolution: {integrity: ${entries[0]}}\n\n  '@pnpm/exe.linux-x64@0.0.0':\n    resolution: {integrity: ${entries[1]}}\n\n---\nlockfileVersion: '9.0'\n`,
    );
    writeFileSync(
      join(cwd, "mock-fetch.mjs"),
      `import {readFileSync} from 'node:fs';\nglobalThis.fetch = async (url) => new Response(readFileSync(url === 'https://registry.npmjs.org/pnpm/-/pnpm-0.0.0.tgz' ? 'bundle.tgz' : 'native.tgz'));\n`,
    );
    writeFileSync(
      join(cwd, ".tmp-nix-e2e/manifest.json"),
      JSON.stringify({
        nodeVersion: process.version.slice(1),
        pnpmVersion: "0.0.0",
        paths: {
          bash: "/usr",
          node: "/usr",
          coreutils: "/usr",
          fontconfig: "/usr",
        },
      }),
    );
    copyFileSync("scripts/nix-e2e.ts", join(cwd, "nix-e2e.ts"));
    copyFileSync("scripts/pnpm-e2e.ts", join(cwd, "pnpm-e2e.ts"));
    const environment = { ...process.env };
    delete environment.GITHUB_ENV;
    delete environment.GITHUB_PATH;
    const result = spawnSync(
      process.execPath,
      ["--import", "./mock-fetch.mjs", "nix-e2e.ts", "tools"],
      {
        cwd,
        encoding: "utf8",
        env: environment,
        timeout: 10_000,
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(join(cwd, ".tmp-nix-e2e/env.sh"), "utf8")).toContain(
      "PLAYWRIGHT_BROWSERS_PATH",
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
