import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDirectory, "../..");
const pureLocLimit = 250;

const budgetSummaryModules = [
  "src/lib/components/BudgetSummary.svelte",
  "src/lib/components/budget/BudgetPeriodHeader.svelte",
  "src/lib/components/budget/BudgetPacePanel.svelte",
  "src/lib/components/budget/BudgetStatsPanel.svelte",
  "src/lib/components/budget/BudgetPeriodForm.svelte",
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

describe("budget summary component structure", () => {
  it("keeps the dashboard summary entrypoint and child panels reviewable", () => {
    for (const modulePath of budgetSummaryModules) {
      expect(existsSync(resolve(repositoryRoot, modulePath)), modulePath).toBe(
        true,
      );
      expect(
        countPureLoc(readProjectFile(modulePath)),
        modulePath,
      ).toBeLessThanOrEqual(pureLocLimit);
    }

    const budgetSummarySource = readProjectFile(
      "src/lib/components/BudgetSummary.svelte",
    );
    expect(budgetSummarySource).toMatch(
      /import\s+BudgetPeriodHeader\s+from\s+"\.\/budget\/BudgetPeriodHeader\.svelte";/,
    );
    expect(budgetSummarySource).toMatch(/<BudgetPeriodHeader(?:\s|>)/);
  });
});
