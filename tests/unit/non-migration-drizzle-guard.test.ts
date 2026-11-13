import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { auditDatabaseSource } from "./helpers/database-source-guard";

function sourceFiles(directory: string): [string, string][] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:[cm]?[jt]sx?|svelte)$/.test(path)
      ? [[path, readFileSync(path, "utf8")]]
      : [];
  });
}

describe("non-migration Drizzle guard", () => {
  it("keeps all application queries behind reviewed Drizzle/D1 boundaries", () => {
    expect(auditDatabaseSource(new Map(sourceFiles("src")))).toEqual([]);
  }, 30_000);
});
