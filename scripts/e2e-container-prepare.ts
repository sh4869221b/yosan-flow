import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { preparePnpm } from "./pnpm-e2e.ts";
import { containerConfig } from "./e2e-container-config.ts";

const config = containerConfig();
assert.equal(process.platform, "linux");
assert.equal(process.arch, "x64");
assert.equal(
  process.version,
  `v${config.nodeVersion}`,
  "Container Node differs from .node_version",
);
const directory = resolve(".tmp-container-e2e");
mkdirSync(directory, { recursive: true });
const { packageManager } = JSON.parse(readFileSync("package.json", "utf8"));
const path = await preparePnpm(
  packageManager,
  readFileSync("pnpm-lock.yaml", "utf8"),
  directory,
);
assert.equal(
  execFileSync(`${path}/pnpm`, ["--version"], { encoding: "utf8" }).trim(),
  packageManager.slice(5),
);
