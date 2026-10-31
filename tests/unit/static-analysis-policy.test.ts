import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const componentPath = "src/lib/components/PeriodCalendar.svelte";
const eslint = new ESLint({ cwd: repositoryRoot });

async function lintComponent(source: string) {
  // Use a project file so typed rules have real parser services. Keep rune mode
  // explicit because the plugin caches Svelte context by filename.
  const [result] = await eslint.lintText(
    `<svelte:options runes={true} />\n${source}`,
    { filePath: componentPath },
  );
  return result;
}

describe("static analysis policy", () => {
  beforeAll(async () => {
    // Starting the typed project service can exceed the default test timeout
    // while the full unit suite initializes its workers concurrently.
    await lintComponent("<p>Ready</p>");
  }, 30_000);

  it.each([
    [
      "svelte/require-each-key",
      '<script lang="ts">const items = [1, 2];</script>{#each items as item}<p>{item}</p>{/each}',
    ],
    ["svelte/button-has-type", "<button>Save</button>"],
    [
      "svelte/no-unused-props",
      '<script lang="ts">type Props = { used: string; unused: string }; let { used }: Props = $props();</script><p>{used}</p>',
    ],
    [
      "svelte/prefer-const",
      '<script lang="ts">let label = "test";</script><p>{label}</p>',
    ],
    [
      "svelte/prefer-svelte-reactivity",
      '<script lang="ts">const values = new Map<string, string>(); function add() { values.set("key", "value"); }</script><button type="button" onclick={add}>{values.size}</button>',
    ],
  ])("enforces %s as an error", async (ruleId, source) => {
    const result = await lintComponent(source);
    expect(
      result.messages.map(({ ruleId, severity }) => ({ ruleId, severity })),
    ).toEqual([{ ruleId, severity: 2 }]);
  });

  it("preserves runes, bindings, and immutable lookup collections", async () => {
    const result = await lintComponent(`
      <script lang="ts">
        let { label }: { label: string } = $props();
        let upper = $derived(label.toUpperCase());
        let length = $derived.by(() => upper.length);
        let count = $state(0);
        let element: HTMLButtonElement;
        const values = $derived(new Map([[label, length]]));
        const keys = new Set(["Enter"]);
      </script>
      <button type="button" bind:this={element} onclick={() => count++}>
        {values.get(label)} {keys.has(label)} {count} {element?.tagName}
      </button>
    `);
    expect(result.messages).toEqual([]);
  });

  it("retains core prefer-const for ordinary TypeScript", async () => {
    const [result] = await eslint.lintText(
      'let label = "test"; export { label };',
      { filePath: "src/lib/dashboard/yen-input.ts" },
    );
    expect(result.messages.map(({ ruleId }) => ruleId)).toEqual([
      "prefer-const",
    ]);
  });

  it("limits the nonreactive Map exception to the documented declaration", async () => {
    const filePath = "src/lib/dashboard/history-controller-state.svelte.ts";
    const [result] = await eslint.lintFiles([filePath]);
    expect(result.messages).toEqual([]);
    expect(result.suppressedMessages.length).toBeGreaterThan(0);
    expect(
      result.suppressedMessages.every(
        ({ ruleId }) => ruleId === "svelte/prefer-svelte-reactivity",
      ),
    ).toBe(true);
    const config = await eslint.calculateConfigForFile(filePath);
    expect(config.rules["svelte/prefer-svelte-reactivity"]).toEqual([2]);
    const source = readFileSync(join(repositoryRoot, filePath), "utf8");
    const [withUntrackedMap] = await eslint.lintText(
      `${source}\nexport const untrackedValues = new Map<string, number>();`,
      { filePath },
    );
    expect(withUntrackedMap.messages.map(({ ruleId }) => ruleId)).toEqual([
      "svelte/prefer-svelte-reactivity",
    ]);
  });

  it("wires warning-strict commands into the required CI jobs", () => {
    const { scripts } = JSON.parse(
      readFileSync(join(repositoryRoot, "package.json"), "utf8"),
    );
    expect(scripts.lint).toBe("eslint .");
    expect(scripts["lint:ci"]).toBe(`${scripts.lint} --max-warnings=0`);
    expect(scripts.check).toBe(
      "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
    );
    expect(scripts["check:ci"]).toBe(`${scripts.check} --fail-on-warnings`);
    const workflow = readFileSync(
      join(repositoryRoot, ".github/workflows/ci.yml"),
      "utf8",
    );
    expect(workflow).toMatch(/run: pnpm lint:ci\s/);
    expect(workflow).toMatch(/run: pnpm check:ci\s/);
    expect(workflow).not.toMatch(/run: pnpm (?:lint|check)\s/);
  });

  it("rejects an ESLint warning without inventing an error", () => {
    const source =
      '<script lang="ts">let { value }: { value: string } = $props(); $inspect(value);</script><p>{value}</p>';
    for (const strict of [false, true]) {
      const result = spawnSync(
        process.execPath,
        [
          join(repositoryRoot, "node_modules/eslint/bin/eslint.js"),
          "--stdin",
          "--stdin-filename",
          componentPath,
          "--format",
          "json",
          ...(strict ? ["--max-warnings=0"] : []),
        ],
        {
          cwd: repositoryRoot,
          input: source,
          encoding: "utf8",
          timeout: 20_000,
        },
      );
      expect(result.error).toBeUndefined();
      const [diagnostics] = JSON.parse(result.stdout);
      expect(diagnostics.errorCount).toBe(0);
      expect(diagnostics.warningCount).toBe(1);
      expect(diagnostics.messages[0].ruleId).toBe("svelte/no-inspect");
      expect(result.status).toBe(strict ? 1 : 0);
    }
  }, 45_000);

  it("rejects a Svelte warning without inventing an error", () => {
    const workspace = mkdtempSync(
      join(repositoryRoot, ".tmp-static-analysis-"),
    );
    try {
      writeFileSync(
        join(workspace, "Warning.svelte"),
        '<img src="logo.png" />',
      );
      for (const strict of [false, true]) {
        const result = spawnSync(
          process.execPath,
          [
            join(repositoryRoot, "node_modules/svelte-check/bin/svelte-check"),
            "--workspace",
            workspace,
            "--no-tsconfig",
            "--output",
            "machine",
            ...(strict ? ["--fail-on-warnings"] : []),
          ],
          { cwd: repositoryRoot, encoding: "utf8", timeout: 20_000 },
        );
        expect(result.error).toBeUndefined();
        expect(result.stdout).toMatch(/COMPLETED 1 FILES 0 ERRORS 1 WARNINGS/);
        expect(result.stdout).toContain("alt");
        expect(result.status).toBe(strict ? 1 : 0);
      }
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 45_000);
});
