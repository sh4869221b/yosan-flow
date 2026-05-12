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
  {
    label: "runtime schema table creation",
    pattern: /\bCREATE\s+TABLE\b/gi,
  },
  {
    label: "runtime schema index creation",
    pattern: /\bCREATE\s+INDEX\b/gi,
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

describe("non-migration Drizzle guard", () => {
  it("keeps production application queries behind Drizzle", () => {
    const violations = listTypeScriptFiles(sourceRoot).flatMap((filePath) => {
      const relativePath = relative(process.cwd(), filePath);
      if (allowedRawD1TypeFiles.has(relativePath)) {
        return [];
      }

      const source = readFileSync(filePath, "utf8");

      return forbiddenPatterns.flatMap(({ label, pattern }) => {
        const matches = [...source.matchAll(pattern)];
        return matches.map((match) => `${relativePath}: ${label}: ${match[0]}`);
      });
    });

    expect(violations).toEqual([]);
  });
});
