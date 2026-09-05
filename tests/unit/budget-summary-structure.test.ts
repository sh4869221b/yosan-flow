import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDirectory, "../..");
const pureLocLimit = 250;

const budgetSummaryModules = [
  "src/lib/components/BudgetSummary.svelte",
  "src/lib/components/dashboard/DashboardPeriodHeader.svelte",
  "src/lib/components/budget/BudgetPacePanel.svelte",
  "src/lib/components/budget/BudgetStatsPanel.svelte",
  "src/lib/components/dashboard/BudgetPeriodForm.svelte",
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
    expect(budgetSummarySource).not.toMatch(/BudgetPeriodForm/);
    expect(budgetSummarySource).not.toMatch(/parseNonNegativeIntegerYenInput/);
    expect(budgetSummarySource).not.toMatch(/BudgetPeriodHeader/);
    expect(budgetSummarySource).not.toMatch(/selectPeriod/);
    expect(budgetSummarySource).not.toMatch(/savePeriod/);
    expect(budgetSummarySource).toMatch(
      /readonly summary: PeriodSummary \| null;\s+readonly loading: boolean;/,
    );

    const workspaceSource = readProjectFile(
      "src/lib/components/dashboard/DashboardWorkspace.svelte",
    );
    expect(workspaceSource).toMatch(/<DashboardPeriodHeader(?:\s|>)/);

    const settingsSource = readProjectFile(
      "src/lib/components/dashboard/PeriodSettingsPanel.svelte",
    );
    expect(settingsSource).toMatch(
      /import\s+BudgetPeriodForm\s+from\s+"\.\/BudgetPeriodForm\.svelte";/,
    );
    expect(settingsSource).toMatch(/<BudgetPeriodForm(?:\s|>)/);
    expect(settingsSource).toMatch(/parseNonNegativeIntegerYenInput/);
  });
});
