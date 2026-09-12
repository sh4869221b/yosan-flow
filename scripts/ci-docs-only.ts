import { readFileSync } from "node:fs";
import process from "node:process";

const documentationPaths = new Set([
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
]);

export function isDocsOnly(paths: readonly string[]): boolean {
  return (
    paths.length > 0 && paths.every((path) => documentationPaths.has(path))
  );
}

if (import.meta.main) {
  const paths = readFileSync(0, "utf8").split("\0");
  if (paths.at(-1) === "") paths.pop();
  process.stdout.write(`docs_only=${isDocsOnly(paths)}\n`);
}
