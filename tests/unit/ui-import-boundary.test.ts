import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const eslint = new ESLint({ cwd: repositoryRoot });
const componentPath = "src/lib/components/PeriodCalendar.svelte";

const imports = [
  ["side-effect import", (id: string) => `import "${id}";`],
  [
    "named import",
    (id: string) => `import { Dialog } from "${id}"; export { Dialog };`,
  ],
  [
    "namespace import",
    (id: string) => `import * as Bits from "${id}"; export { Bits };`,
  ],
  [
    "type import",
    (id: string) =>
      `import type { Dialog } from "${id}"; export type { Dialog };`,
  ],
  ["named re-export", (id: string) => `export { Dialog } from "${id}";`],
  ["type re-export", (id: string) => `export type { Dialog } from "${id}";`],
  ["star re-export", (id: string) => `export * from "${id}";`],
  ["namespace re-export", (id: string) => `export * as Bits from "${id}";`],
  [
    "import equals",
    (id: string) => `import Bits = require("${id}"); export { Bits };`,
  ],
  [
    "dynamic import",
    (id: string) => `export const load = () => import("${id}");`,
  ],
  [
    "template import",
    (id: string) => `export const load = () => import(\`${id}\`);`,
  ],
  [
    "subpath template import",
    (id: string) =>
      `export const load = (part: string) => import(\`${id}/\${part}\`);`,
  ],
  [
    "type expression",
    (id: string) => `export type Dialog = import("${id}").Dialog;`,
  ],
  [
    "typeof expression",
    (id: string) => `export type Bits = typeof import("${id}");`,
  ],
  ["require", (id: string) => `export const Bits = require("${id}");`],
  [
    "template require",
    (id: string) => `export const Bits = require(\`${id}\`);`,
  ],
  [
    "subpath template require",
    (id: string) =>
      `export const load = (part: string) => require(\`${id}/\${part}\`);`,
  ],
] as const;

async function boundaryMessages(source: string, filePath: string) {
  const [result] = await eslint.lintText(source, { filePath });
  expect(result.fatalErrorCount, JSON.stringify(result.messages)).toBe(0);
  return result.messages.filter(
    ({ ruleId }) =>
      ruleId === "no-restricted-imports" || ruleId === "no-restricted-syntax",
  );
}

describe("shared UI import boundary", () => {
  beforeAll(async () => {
    // Initialize the typed Svelte project before per-case timeouts apply.
    await boundaryMessages("<p>Ready</p>", componentPath);
  }, 30_000);

  it.each(imports)(
    "rejects a direct or subpath %s in feature code",
    async (_name, source) => {
      for (const moduleId of ["bits-ui", "bits-ui/dialog/internal"]) {
        const messages = await boundaryMessages(
          source(moduleId),
          "src/lib/dashboard/yen-input.ts",
        );
        expect(messages, moduleId).toHaveLength(1);
        expect(messages[0].severity).toBe(2);
      }
    },
  );

  it.each(imports)(
    "allows a %s only within the shared UI directory",
    async (_name, source) => {
      expect(
        await boundaryMessages(
          source("bits-ui/dialog"),
          "src/lib/components/ui/adapter.ts",
        ),
      ).toEqual([]);
    },
  );

  it.each([
    "src/lib/components/ui-adapter.ts",
    "src/lib/components/ui.ts",
    "src/lib/components/ui-extra/adapter.ts",
    "src/lib/dashboard/yen-input.ts",
    "src/routes/adapter.ts",
  ])("keeps %s outside the exception", async (filePath) => {
    expect(
      await boundaryMessages('export * from "bits-ui";', filePath),
    ).toHaveLength(1);
  });

  it.each(imports)(
    "does not confuse similarly named modules with a Bits UI %s",
    async (_name, source) => {
      for (const moduleId of [
        "bits-ui-extra",
        "@example/bits-ui",
        "./bits-ui",
      ]) {
        expect(
          await boundaryMessages(
            source(moduleId),
            "src/lib/dashboard/yen-input.ts",
          ),
        ).toEqual([]);
      }
    },
  );

  it("enforces the boundary in both Svelte script contexts and markup", async () => {
    const messages = await boundaryMessages(
      `
      <script module lang="ts">export * from "bits-ui/dialog";</script>
      <script lang="ts">import { Dialog } from "bits-ui";</script>
      {#await import("bits-ui/dialog")}<p>{Dialog.name}</p>{/await}
    `,
      componentPath,
    );
    expect(messages).toHaveLength(3);
    expect(messages.every(({ severity }) => severity === 2)).toBe(true);
  });

  it("preserves business imports from shared UI and mentions in text", async () => {
    expect(
      await boundaryMessages(
        `
      import { Dialog } from "#lib/components/ui/dialog/index.ts";
      // import "bits-ui" is documentation, not a dependency.
      export const label = "bits-ui/dialog";
      export { Dialog };
    `,
        "src/lib/dashboard/yen-input.ts",
      ),
    ).toEqual([]);
  });

  it("does not infer a Bits UI dependency from an ambiguous computed name", async () => {
    expect(
      await boundaryMessages(
        `
          export const fromPrefix = (prefix: string) => import(\`\${prefix}bits-ui/dialog\`);
          export const fromSuffix = (suffix: string) => import(\`bits-ui\${suffix}\`);
        `,
        "src/lib/dashboard/yen-input.ts",
      ),
    ).toEqual([]);
  });
});
