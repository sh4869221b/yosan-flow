import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

it("prepares integrity-verified pnpm without project dependencies and links its payload", () => {
  const cwd = mkdtempSync(join(tmpdir(), "yosan-container-tools-"));
  try {
    const directories = [join(cwd, "bundle"), join(cwd, "native")];
    const entries = directories.map((path, index) => {
      mkdirSync(join(path, "dist"), { recursive: true });
      writeFileSync(
        join(path, "package.json"),
        JSON.stringify({
          name: index === 0 ? "pnpm" : "@pnpm/exe.linux-x64",
          version: "0.0.0",
        }),
      );
      writeFileSync(join(path, "pnpm"), '#!/bin/sh\nprintf "0.0.0\\n"\n');
      writeFileSync(join(path, "dist/payload"), "node-gyp payload");
      execFileSync("tar", [
        "-czf",
        `${path}.tgz`,
        "-C",
        cwd,
        path.split("/").at(-1)!,
      ]);
      return `sha512-${createHash("sha512")
        .update(readFileSync(`${path}.tgz`))
        .digest("base64")}`;
    });
    writeFileSync(
      join(cwd, "package.json"),
      JSON.stringify({ packageManager: "pnpm@0.0.0" }),
    );
    const applicationLock = readFileSync("pnpm-lock.yaml", "utf8").split(
      /^---\s*$/m,
    )[2];
    writeFileSync(
      join(cwd, "pnpm-lock.yaml"),
      `---\nlockfileVersion: '9.0'\n\nimporters:\n\n  .:\n    packageManagerDependencies:\n      pnpm:\n        specifier: 0.0.0\n        version: 0.0.0\n\npackages:\n\n  pnpm@0.0.0:\n    resolution: {integrity: ${entries[0]}}\n\n  '@pnpm/exe.linux-x64@0.0.0':\n    resolution: {integrity: ${entries[1]}}\n\n---\n${applicationLock}`,
    );
    writeFileSync(join(cwd, ".node_version"), process.version.slice(1));
    mkdirSync(join(cwd, "tooling/ci/container"), { recursive: true });
    copyFileSync(
      "tooling/ci/container/image.json",
      join(cwd, "tooling/ci/container/image.json"),
    );
    for (const file of [
      "e2e-container-config.ts",
      "e2e-container-prepare.ts",
      "pnpm-e2e.ts",
    ])
      copyFileSync(`scripts/${file}`, join(cwd, file));
    writeFileSync(
      join(cwd, "mock-fetch.mjs"),
      `import {readFileSync} from 'node:fs';\nglobalThis.fetch = async url => new Response(readFileSync(url === 'https://registry.npmjs.org/pnpm/-/pnpm-0.0.0.tgz' ? 'bundle.tgz' : 'native.tgz'));\n`,
    );
    const result = spawnSync(
      process.execPath,
      ["--import", "./mock-fetch.mjs", "e2e-container-prepare.ts"],
      { cwd, encoding: "utf8", timeout: 10_000 },
    );
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(join(cwd, ".tmp-container-e2e/pnpm/dist/payload"))).toBe(
      true,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
