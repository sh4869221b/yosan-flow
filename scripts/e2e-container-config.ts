import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

export function lockedPlaywright(lockfile: string) {
  const documents = lockfile.split(/^---\s*$/m).filter((part) => part.trim());
  assert.equal(documents.length, 2, "Unsupported pnpm lockfile documents");
  const importer = documents[1].split("\npackages:\n")[0];
  const selections = [
    ...importer.matchAll(
      /\n      '@playwright\/test':\n        specifier: [^\n]+\n        version: (\d+\.\d+\.\d+)\n/g,
    ),
  ];
  assert.equal(
    selections.length,
    1,
    "Expected one locked Playwright selection",
  );
  const version = selections[0][1];
  for (const name of ["@playwright/test", "playwright", "playwright-core"]) {
    const key = `${name}@${version}`;
    assert.ok(
      documents[1].includes(`\n  '${key}':\n`) ||
        documents[1].includes(`\n  ${key}:\n`),
      `Missing locked ${key}`,
    );
  }
  return version;
}

export function containerConfig() {
  const config = JSON.parse(
    readFileSync("tooling/ci/container/image.json", "utf8"),
  );
  const version = lockedPlaywright(readFileSync("pnpm-lock.yaml", "utf8"));
  assert.match(
    config.playwrightImage,
    /^mcr\.microsoft\.com\/playwright:v\d+\.\d+\.\d+-noble@sha256:[a-f0-9]{64}$/,
  );
  assert.ok(
    config.playwrightImage.startsWith(
      `mcr.microsoft.com/playwright:v${version}-noble@`,
    ),
    "Locked Playwright differs from container image; review image.json",
  );
  assert.match(config.nodeDigest, /^sha256:[a-f0-9]{64}$/);
  const node = readFileSync(".node_version", "utf8").trim();
  assert.match(node, /^\d+\.\d+\.\d+$/);
  return {
    ...config,
    playwrightVersion: version,
    nodeVersion: node,
    nodeImage: `docker.io/library/node:${node}-bookworm-slim@${config.nodeDigest}`,
  };
}

if (import.meta.main) {
  const config = containerConfig();
  const key = process.argv[2];
  if (key) {
    assert.ok(
      Object.hasOwn(config, key),
      "Unknown container configuration key",
    );
    console.log(config[key]);
  } else console.log(JSON.stringify(config));
}
