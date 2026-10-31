import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

export function pnpmSources(packageManager: string, lockfile: string) {
  const match = /^pnpm@(\d+\.\d+\.\d+)$/.exec(packageManager);
  assert.ok(match, "Expected an exact stable pnpm packageManager version");
  const version = match[1];
  // pnpm 12 puts package-manager dependencies in the first YAML document.
  // Match only its exact generated layout; unsupported lockfiles fail closed.
  const managerLock = lockfile.split(/^---\s*$/m)[1];
  assert.ok(managerLock, "Missing package-manager lockfile document");
  const selection =
    /\n    packageManagerDependencies:\n      pnpm:\n        specifier: ([^\n]+)\n        version: ([^\n]+)\n/.exec(
      managerLock,
    );
  assert.ok(selection, "Missing locked pnpm selection");
  assert.equal(
    selection[1],
    version,
    "pnpm specifier disagrees with packageManager",
  );
  assert.equal(
    selection[2],
    version,
    "Locked pnpm disagrees with packageManager",
  );
  return ["pnpm", "@pnpm/exe.linux-x64"].map((name) => {
    const key = `${name}@${version}`;
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const entries = [
      ...managerLock.matchAll(
        new RegExp(
          `\\n  '?${escapedKey}'?:\\n    resolution: \\{integrity: (sha512-[A-Za-z0-9+/]{86}==)\\}\\n`,
          "g",
        ),
      ),
    ];
    assert.equal(entries.length, 1, `Expected one integrity pin for ${key}`);
    const basename = name.split("/").at(-1);
    return {
      version,
      name,
      integrity: entries[0][1],
      url: `https://registry.npmjs.org/${name}/-/${basename}-${version}.tgz`,
    };
  });
}

export function verifyPnpmArchive(archive: Uint8Array, integrity: string) {
  assert.equal(
    `sha512-${createHash("sha512").update(archive).digest("base64")}`,
    integrity,
    "pnpm archive integrity mismatch",
  );
}

export async function preparePnpm(
  packageManager: string,
  lockfile: string,
  directory: string,
) {
  const sources = pnpmSources(packageManager, lockfile);
  const directories = [
    join(directory, "pnpm-source"),
    join(directory, "pnpm-native"),
  ];
  for (const [index, source] of sources.entries()) {
    const response = await fetch(source.url, {
      signal: AbortSignal.timeout(120_000),
    });
    assert.ok(response.ok, `pnpm archive download failed: ${response.status}`);
    const archive = Buffer.from(await response.arrayBuffer());
    verifyPnpmArchive(archive, source.integrity);
    const destination = directories[index];
    rmSync(destination, { recursive: true, force: true });
    mkdirSync(destination, { recursive: true });
    const archivePath = join(destination, "source.tgz");
    writeFileSync(archivePath, archive);
    execFileSync("tar", [
      "-xzf",
      archivePath,
      "-C",
      destination,
      "--strip-components=1",
      "--no-same-owner",
    ]);
    rmSync(archivePath);
    const info = JSON.parse(
      readFileSync(join(destination, "package.json"), "utf8"),
    );
    assert.equal(info.name, source.name);
    assert.equal(info.version, source.version);
  }
  const pnpmDirectory = join(directory, "pnpm");
  rmSync(pnpmDirectory, { recursive: true, force: true });
  mkdirSync(pnpmDirectory, { recursive: true });
  // Keep the native executable next to the bundle's node-gyp payload, as npm does.
  copyFileSync(join(directories[1], "pnpm"), join(pnpmDirectory, "pnpm"));
  chmodSync(join(pnpmDirectory, "pnpm"), 0o755);
  symlinkSync(join(directories[0], "dist"), join(pnpmDirectory, "dist"));
  return pnpmDirectory;
}
