import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { FallowOutput } from "fallow/types";

type DeadCodeReport = Extract<FallowOutput, { kind: "dead-code" }>;

const root = resolve(import.meta.dirname, "../..");
const require = createRequire(import.meta.url);
const cli = require.resolve("fallow/bin/fallow");
const fixtures: string[] = [];

function write(root: string, path: string, content: string): void {
  const destination = join(root, path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, content);
}

function fixture(): string {
  const directory = mkdtempSync(join(root, ".tmp-fallow-config-"));
  fixtures.push(directory);
  write(
    directory,
    ".fallowrc.jsonc",
    readFileSync(join(root, ".fallowrc.jsonc"), "utf8"),
  );
  write(
    directory,
    "package.json",
    JSON.stringify({
      private: true,
      type: "module",
      imports: { "#lib/*": "./src/lib/*" },
      devDependencies: {
        "@sveltejs/kit": "*",
        "@playwright/test": "*",
        "drizzle-orm": "*",
        vitest: "*",
        wrangler: "*",
      },
    }),
  );
  write(
    directory,
    "tsconfig.json",
    JSON.stringify({
      compilerOptions: { moduleResolution: "bundler" },
    }),
  );
  return directory;
}

function analyze(directory: string): DeadCodeReport {
  const result = spawnSync(
    process.execPath,
    [
      cli,
      "dead-code",
      "--root",
      directory,
      "--no-cache",
      "--format",
      "json",
      "--quiet",
    ],
    { encoding: "utf8", timeout: 15_000 },
  );
  expect(result.error).toBeUndefined();
  expect([0, 1]).toContain(result.status);
  const report = JSON.parse(result.stdout) as DeadCodeReport;
  expect(report.kind).toBe("dead-code");
  return report;
}

afterEach(() => {
  for (const directory of fixtures.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("Fallow project discovery", () => {
  it("retains implicit routes and tests while finding unused source and entry exports", () => {
    const directory = fixture();
    write(
      directory,
      "src/routes/+page.server.ts",
      'import { value } from "#lib/runtime.ts"; export const load = () => ({ value }); export const accidentalExport = 1;',
    );
    write(
      directory,
      "src/lib/runtime.ts",
      "export const value = 42; export const unusedValue = 0;",
    );
    write(directory, "src/lib/orphan.ts", "export const orphan = true;");
    write(directory, "src/lib/test-only.ts", "export const helper = () => 1;");
    write(
      directory,
      "tests/unit/example.test.ts",
      'import { helper } from "../../src/lib/test-only"; helper();',
    );
    write(
      directory,
      "tests/e2e/example.spec.ts",
      'import { helper } from "../../src/lib/test-only"; helper();',
    );
    const report = analyze(directory);
    expect(report.unused_files.map((finding) => finding.path)).toEqual([
      "src/lib/orphan.ts",
    ]);
    expect(
      report.unused_exports.map((finding) => finding.export_name).sort(),
    ).toEqual(["accidentalExport", "unusedValue"]);
    expect(report.unresolved_imports).toEqual([]);
  });

  it("retains only the tooling exports actually invoked by config loaders", () => {
    const directory = fixture();
    for (const path of [
      "drizzle.config.ts",
      "playwright.config.ts",
      "scripts/e2e-timing.ts",
    ]) {
      write(
        directory,
        path,
        "export default function entry() {} export const accidentalExport = 1;",
      );
    }
    write(
      directory,
      "scripts/e2e-summary.ts",
      'import { summary } from "../src/lib/summary"; summary();',
    );
    write(directory, "src/lib/summary.ts", "export const summary = () => 1;");
    const report = analyze(directory);
    expect(report.unused_files).toEqual([]);
    expect(report.unused_exports).toHaveLength(3);
    expect(
      report.unused_exports.every(
        (finding) => finding.export_name === "accidentalExport",
      ),
    ).toBe(true);
  });

  it("excludes exact generated Worker types but still analyzes authored declarations", () => {
    const directory = fixture();
    for (const path of [
      "worker-configuration.d.ts",
      "worker-runtime.d.ts",
      ".svelte-kit/generated.ts",
      ".wrangler/generated.ts",
      ".tmp-state/generated.ts",
      "test-results/generated.ts",
      "playwright-report/generated.ts",
    ]) {
      write(directory, path, 'export { missing } from "./does-not-exist";');
    }
    write(
      directory,
      "src/app.d.ts",
      'import "./authored-contract"; export {};',
    );
    write(
      directory,
      "src/authored-contract.d.ts",
      'export { missing } from "./does-not-exist";',
    );
    const report = analyze(directory);
    expect(report.unresolved_imports.map((finding) => finding.path)).toEqual([
      "src/authored-contract.d.ts",
    ]);
    expect(report.unused_files).toEqual([]);
  });
});
