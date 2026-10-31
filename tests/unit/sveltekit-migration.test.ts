import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(path)
      : /\.(ts|js|svelte)$/.test(path)
        ? [path]
        : [];
  });
}

describe("SvelteKit 3 module configuration", () => {
  it("uses native package imports and the generated app TypeScript project", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    const tsconfig = JSON.parse(readFileSync("tsconfig.json", "utf8"));
    expect(pkg.imports["#lib/*"]).toBe("./src/lib/*");
    expect(tsconfig.extends).toBe("$app/tsconfig");
    expect(tsconfig.include).toEqual(expect.arrayContaining(["src", "tests"]));
    expect(existsSync("svelte.config.js")).toBe(false);
  });

  it("resolves every library import explicitly without legacy aliases", () => {
    const failures = sourceFiles("src").flatMap((path) => {
      const source = readFileSync(path, "utf8");
      const failures: string[] = [];
      if (/["']\$lib(?:\/|["'])/.test(source)) failures.push(path);
      for (const match of source.matchAll(/["']#lib\/([^"']+)["']/g)) {
        if (
          !/\.(ts|js|svelte|css)$/.test(match[1]) ||
          !existsSync(join("src/lib", match[1]))
        ) {
          failures.push(`${path}: ${match[1]}`);
        }
      }
      return failures;
    });
    expect(failures).toEqual([]);
  });
});
