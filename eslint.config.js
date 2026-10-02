import { defineConfig } from "eslint/config";
import globals from "globals";
import svelte from "eslint-plugin-svelte";
import ts from "typescript-eslint";
import svelteConfig from "./svelte.config.js";

export default defineConfig(
  {
    ignores: [
      ".svelte-kit/",
      "build/",
      "node_modules/",
      ".wrangler/",
      ".tmp-*/",
      "coverage/",
      "test-results/",
      "playwright-report/",
      "worker-configuration.d.ts",
      "worker-runtime.d.ts",
    ],
  },
  ...ts.configs.recommended,
  ...svelte.configs["flat/recommended"],
  ...svelte.configs["flat/prettier"],
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: {
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["**/*.ts", "**/*.svelte.ts"],
    rules: {
      // TypeScript-aware analysis replaces the core rule for TS declarations.
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: [
      "eslint.config.js",
      "svelte.config.js",
      "vite.config.ts",
      "vitest.config.ts",
      "playwright.config.ts",
      "scripts/e2e-*.ts",
      "scripts/fallow-ci.ts",
      "tests/**/*.ts",
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: [
      "src/lib/server/**/*.ts",
      "src/routes/**/+page.server.ts",
      "src/routes/**/+server.ts",
    ],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
      },
    },
  },
  {
    files: ["src/**/*.svelte", "src/**/*.svelte.ts", "src/**/*.svelte.js"],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    files: [
      "src/lib/server/db/daily-history-repository.ts",
      "src/lib/server/db/daily-total-repository.ts",
      "tests/e2e/helpers/db.ts",
      "tests/integration/**/*.test.ts",
    ],
    rules: {
      // Drizzle/D1 adapters and integration fakes cross intentionally untyped
      // query boundaries; keep this exception limited to the listed files.
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: ["**/*.svelte", "**/*.svelte.ts", "**/*.svelte.js"],
    rules: {
      "svelte/require-each-key": "error",
      "svelte/button-has-type": "error",
      // Already enforced by flat/recommended; retain error severity rather than
      // weakening existing checks to the warning level proposed in #234.
      "svelte/no-unused-props": "error",
      // The Svelte-aware replacement preserves $props/$derived declarations.
      // Ordinary TypeScript files retain the core prefer-const rule.
      "prefer-const": "off",
      "svelte/prefer-const": "error",
      // UI mutations need reactive collections. Nonreactive bookkeeping must
      // explain a narrowly scoped exception at the individual declaration.
      "svelte/prefer-svelte-reactivity": "error",
    },
    languageOptions: {
      parserOptions: {
        parser: ts.parser,
        projectService: true,
        extraFileExtensions: [".svelte"],
        svelteConfig,
      },
    },
  },
);
