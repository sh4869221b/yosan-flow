import { spawnSync } from "node:child_process";
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
    for (const path of [bundle, native])
      writeFileSync(
        join(path, "package.json"),
        JSON.stringify({ version: "0.0.0" }),
      );
    writeFileSync(join(native, "pnpm"), '#!/bin/sh\nprintf "0.0.0\\n"\n');
    writeFileSync(
      join(cwd, ".tmp-nix-e2e/manifest.json"),
      JSON.stringify({
        nodeVersion: process.version.slice(1),
        pnpmVersion: "0.0.0",
        pnpmSource: bundle,
        pnpmNative: native,
        paths: {
          bash: "/usr",
          node: "/usr",
          coreutils: "/usr",
          fontconfig: "/usr",
        },
      }),
    );
    copyFileSync("scripts/nix-e2e.ts", join(cwd, "nix-e2e.ts"));
    const environment = { ...process.env };
    delete environment.GITHUB_ENV;
    delete environment.GITHUB_PATH;
    const result = spawnSync(process.execPath, ["nix-e2e.ts", "tools"], {
      cwd,
      encoding: "utf8",
      env: environment,
      timeout: 10_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(join(cwd, ".tmp-nix-e2e/env.sh"), "utf8")).toContain(
      "PLAYWRIGHT_BROWSERS_PATH",
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
