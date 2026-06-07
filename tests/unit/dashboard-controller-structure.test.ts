import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDirectory, "../..");
const pureLocLimit = 250;

const controllerModules = [
  "src/lib/dashboard/controller-types.ts",
  "src/lib/dashboard/page-controller.svelte.ts",
  "src/lib/dashboard/period-controller-actions.svelte.ts",
  "src/lib/dashboard/period-controller-initial-state.ts",
  "src/lib/dashboard/period-controller-state.svelte.ts",
  "src/lib/dashboard/day-entry-controller-state.svelte.ts",
  "src/lib/dashboard/history-controller-state.svelte.ts",
  "src/lib/dashboard/modal-preview.ts",
] as const;

function readProjectFile(path: string): string {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

function countPureLoc(source: string): number {
  return source.split("\n").filter((line) => {
    const trimmed = line.trim();
    return (
      trimmed.length > 0 &&
      !trimmed.startsWith("//") &&
      !trimmed.startsWith("#")
    );
  }).length;
}

describe("dashboard page controller structure", () => {
  it("keeps the public controller entrypoint and focused state modules reviewable", () => {
    for (const modulePath of controllerModules) {
      expect(existsSync(resolve(repositoryRoot, modulePath)), modulePath).toBe(
        true,
      );
      expect(
        countPureLoc(readProjectFile(modulePath)),
        modulePath,
      ).toBeLessThanOrEqual(pureLocLimit);
    }

    expect(
      readProjectFile("src/lib/dashboard/page-controller.svelte.ts"),
    ).toContain("createDashboardPageController");
  });
});
