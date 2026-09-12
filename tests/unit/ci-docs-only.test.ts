import { describe, expect, it } from "vitest";
import { isDocsOnly } from "../../scripts/ci-docs-only";

describe("CI documentation-only changes", () => {
  it("accepts changes limited to the explicitly allowed documentation", () => {
    expect(
      isDocsOnly([
        "README.md",
        "CONTRIBUTING.md",
        "DESIGN.md",
        "AGENTS.md",
        "src/lib/components/AGENTS.md",
        "src/lib/dashboard/AGENTS.md",
        "src/lib/server/AGENTS.md",
        "src/lib/server/db/AGENTS.md",
        "src/lib/server/services/AGENTS.md",
        "src/routes/AGENTS.md",
        "tests/AGENTS.md",
        "tests/e2e/AGENTS.md",
        "tests/integration/AGENTS.md",
        "tests/unit/AGENTS.md",
      ]),
    ).toBe(true);
  });

  it.each([
    "src/routes/+page.svelte",
    "migrations/0001.sql",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    ".node_version",
    "wrangler.jsonc",
    "svelte.config.js",
    "vite.config.ts",
    "playwright.config.ts",
    ".github/workflows/ci.yml",
    "static/example.md",
  ])("requires E2E when documentation is mixed with %s", (path) => {
    expect(isDocsOnly(["README.md", path])).toBe(false);
  });

  it("accepts a rename between allowed documents", () => {
    expect(isDocsOnly(["DESIGN.md", "README.md"])).toBe(true);
  });

  it("requires E2E when a rename removes a non-documentation path", () => {
    expect(isDocsOnly(["issue-343-fixture.txt", "README.md"])).toBe(false);
  });

  it("requires E2E for an empty diff", () => {
    expect(isDocsOnly([])).toBe(false);
  });
});
