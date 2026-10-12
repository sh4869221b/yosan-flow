import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assertE2EEnvironmentFiles,
  containerConfig,
  lockedPlaywright,
} from "../../scripts/e2e-container-config.ts";

const lockfile = readFileSync("pnpm-lock.yaml", "utf8");
const version = lockedPlaywright(lockfile);
const requested = JSON.parse(readFileSync("package.json", "utf8"))
  .devDependencies["@playwright/test"];

describe("container E2E version contract", () => {
  it("uses the resolved package version rather than its requested range", () => {
    const config = containerConfig();
    expect(config.playwrightImage).toContain(
      `:v${lockedPlaywright(lockfile)}-noble@sha256:`,
    );
    expect(config.nodeImage).toContain(
      `:${readFileSync(".node_version", "utf8").trim()}-bookworm-slim@sha256:`,
    );
    expect(
      lockedPlaywright(
        lockfile.replace(`specifier: ${requested}`, "specifier: ^1.0.0"),
      ),
    ).toBe(config.playwrightVersion);
    expect(lockedPlaywright(lockfile.replaceAll(version, "99.0.0"))).toBe(
      "99.0.0",
    );
  });

  it("fails closed for missing, ambiguous or unsupported lock selections", () => {
    expect(() => lockedPlaywright("lockfileVersion: '9.0'")).toThrow(
      /documents/,
    );
    const selection = lockfile.match(
      /\n      '@playwright\/test':\n        specifier: [^\n]+\n        version: [^\n]+\n/,
    )![0];
    expect(() => lockedPlaywright(lockfile.replace(selection, "\n"))).toThrow(
      /selection/,
    );
    expect(() =>
      lockedPlaywright(lockfile.replace(selection, selection + selection)),
    ).toThrow(/selection/);
    const version = lockedPlaywright(lockfile);
    expect(() =>
      lockedPlaywright(
        lockfile.replace(
          `\n  playwright-core@${version}:\n`,
          "\n  playwright-core@99.0.0:\n",
        ),
      ),
    ).toThrow(/Missing locked/);
  });
});

it("rejects local secret environment files without printing their contents", () => {
  expect(() => assertE2EEnvironmentFiles([".env", ".dev.vars"])).toThrow(
    /clean worktree/,
  );
  expect(() => assertE2EEnvironmentFiles([".env.local"])).toThrow();
  expect(() => assertE2EEnvironmentFiles([".dev.vars.production"])).toThrow();
  expect(() =>
    assertE2EEnvironmentFiles([".env.example", ".dev.vars.example"]),
  ).not.toThrow();
});
