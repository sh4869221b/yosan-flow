import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = join(process.cwd(), "src");

const allowedRawD1TypeFiles = new Set(["src/lib/server/db/d1-types.ts"]);

const forbiddenPatterns: Array<{ label: string; pattern: RegExp }> = [
  { label: "raw D1 prepare", pattern: /\.prepare\s*\(/g },
  { label: "raw D1 batch", pattern: /\bdb\.batch\s*\(/g },
  {
    label: "removed daily total prepared-statement API",
    pattern: /\bprepareUpsertDailyTotal\b/g,
  },
  {
    label: "removed daily history prepared-statement API",
    pattern: /\bprepareInsertHistory\b/g,
  },
  {
    label: "D1PreparedStatement outside D1 type boundary",
    pattern: /\bD1PreparedStatement\b/g,
  },
];

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      return listTypeScriptFiles(path);
    }
    return path.endsWith(".ts") ? [path] : [];
  });
}

function removeAllowedSchemaBootstrap(relativePath: string, source: string) {
  if (relativePath !== "src/lib/server/services/month-summary-service.ts") {
    return source;
  }

  const start = source.indexOf("const d1SchemaStatements = [");
  const end = source.indexOf("function getDefaultInMemoryApiServices");
  if (start === -1 || end === -1 || end <= start) {
    return source;
  }

  return `${source.slice(0, start)}${source.slice(end)}`;
}

describe("non-migration Drizzle guard", () => {
  it("keeps production application queries behind Drizzle", () => {
    const violations = listTypeScriptFiles(sourceRoot).flatMap((filePath) => {
      const relativePath = relative(process.cwd(), filePath);
      if (allowedRawD1TypeFiles.has(relativePath)) {
        return [];
      }

      const source = removeAllowedSchemaBootstrap(
        relativePath,
        readFileSync(filePath, "utf8"),
      );

      return forbiddenPatterns.flatMap(({ label, pattern }) => {
        const matches = [...source.matchAll(pattern)];
        return matches.map((match) => `${relativePath}: ${label}: ${match[0]}`);
      });
    });

    expect(violations).toEqual([]);
  });
});
