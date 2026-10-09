import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pnpmSources, verifyPnpmArchive } from "../../scripts/pnpm-e2e.ts";

const lockfile = readFileSync("pnpm-lock.yaml", "utf8");
const { packageManager } = JSON.parse(readFileSync("package.json", "utf8"));

describe("E2E pnpm lockfile pins", () => {
  it("selects the published bundle and Linux glibc executable from the manager lock", () => {
    const sources = pnpmSources(packageManager, lockfile);
    expect(sources.map(({ name }) => name)).toEqual([
      "pnpm",
      "@pnpm/exe.linux-x64",
    ]);
    for (const source of sources) {
      expect(`pnpm@${source.version}`).toBe(packageManager);
      expect(source.url).toBe(
        `https://registry.npmjs.org/${source.name}/-/${source.name.split("/").at(-1)}-${source.version}.tgz`,
      );
      expect(source.integrity).toMatch(/^sha512-/);
    }
  });

  it("uses a future Renovate update without a separate Nix/workflow pin", () => {
    const version = packageManager.slice("pnpm@".length);
    const updatedLock = lockfile.replaceAll(version, "99.0.0");
    expect(
      pnpmSources("pnpm@99.0.0", updatedLock).map(({ version }) => version),
    ).toEqual(["99.0.0", "99.0.0"]);
    const flake = readFileSync("flake.nix", "utf8");
    expect(flake).toContain("project.packageManager");
    expect(flake).not.toMatch(/pnpmVersion = "|pnpm-\$\{pnpmVersion\}\.tgz/);
    for (const name of ["ci.yml", "renovate-format.yml"]) {
      expect(readFileSync(`.github/workflows/${name}`, "utf8")).not.toMatch(
        /uses: pnpm\/action-setup@[^\n]+\n\s+with:\n\s+version:/,
      );
    }
  });

  it("rejects either locked selection disagreeing with packageManager", () => {
    const version = packageManager.slice("pnpm@".length);
    expect(() => pnpmSources("pnpm@99.0.0", lockfile)).toThrow(/disagrees/);
    for (const field of ["specifier", "version"]) {
      expect(() =>
        pnpmSources(
          packageManager,
          lockfile.replace(
            `        ${field}: ${version}`,
            `        ${field}: 99.0.0`,
          ),
        ),
      ).toThrow(/disagrees/);
    }
  });

  it("rejects missing, ambiguous and unsupported pins instead of resolving latest", () => {
    expect(() => pnpmSources("yarn@1.0.0", lockfile)).toThrow(
      /exact stable pnpm/,
    );
    expect(() => pnpmSources(packageManager, "lockfileVersion: '9.0'")).toThrow(
      /document/,
    );
    expect(() =>
      pnpmSources(
        packageManager,
        lockfile.replace(
          "    packageManagerDependencies:",
          "    unsupportedDependencies:",
        ),
      ),
    ).toThrow(/selection/);
    expect(() =>
      pnpmSources(
        packageManager,
        lockfile.replace(
          pnpmSources(packageManager, lockfile)[0].integrity,
          "sha256-unsupported",
        ),
      ),
    ).toThrow(/integrity pin/);
    const nativeEntry = lockfile.match(
      /\n  '@pnpm\/exe\.linux-x64@[^']+':\n    resolution: [^\n]+\n/,
    )![0];
    expect(() =>
      pnpmSources(packageManager, lockfile.replace(nativeEntry, "\n")),
    ).toThrow(/integrity pin/);
    expect(() =>
      pnpmSources(
        packageManager,
        lockfile.replace(nativeEntry, nativeEntry + nativeEntry),
      ),
    ).toThrow(/integrity pin/);
    // A similarly named ordinary dependency in the second document cannot supply a missing pin.
    expect(() =>
      pnpmSources(
        packageManager,
        lockfile.replace(nativeEntry, "\n") + nativeEntry,
      ),
    ).toThrow(/integrity pin/);
  });
});

describe("pnpm archive integrity", () => {
  it("verifies the archive bytes and rejects tampering before extraction", () => {
    const archive = Buffer.from("a pinned npm tarball");
    const integrity = `sha512-${createHash("sha512").update(archive).digest("base64")}`;
    expect(() => verifyPnpmArchive(archive, integrity)).not.toThrow();
    expect(() =>
      verifyPnpmArchive(Buffer.from("altered tarball"), integrity),
    ).toThrow(/integrity mismatch/);
  });
});
