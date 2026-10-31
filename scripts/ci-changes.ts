import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";

const documents = new Set([
  "README.md",
  "CONTRIBUTING.md",
  "DESIGN.md",
  "tooling/fallow/README.md",
]);

function documentation(path: string): boolean {
  const parts = path.split("/");
  if (parts.some((part) => !part || part === "." || part === ".."))
    return false;
  return (
    documents.has(path) ||
    (path.startsWith("tooling/ci/") && path.endsWith(".md"))
  );
}

/** Git's NUL format retains whitespace, newlines and both rename endpoints. */
export function classifyDiff(diff: string): boolean {
  if (!diff || !diff.endsWith("\0"))
    throw new Error("Empty or incomplete diff");
  const fields = diff.slice(0, -1).split("\0");
  let docsOnly = true;
  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    if (!/^(?:[AMDT]|R(?:100|0\d{2}))$/.test(status)) {
      throw new Error("Unexpected diff status");
    }
    const count = status.startsWith("R") ? 2 : 1;
    const paths = fields.slice(index, index + count);
    if (paths.length !== count || paths.some((path) => !path)) {
      throw new Error("Missing diff path");
    }
    if (status === "T" || !paths.every(documentation)) docsOnly = false;
    index += count;
  }
  return docsOnly;
}

export function classifyChanges(
  cwd: string,
  event: string | undefined,
  base: string | undefined,
  head: string | undefined,
): boolean {
  if (event === "push") return false;
  if (event !== "pull_request") throw new Error("Unsupported CI event");
  const git = (args: string[]) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
  if (git(["rev-parse", "--is-shallow-repository"]).trim() !== "false") {
    throw new Error("Complete history is required");
  }
  for (const revision of [base, head]) {
    if (!revision || !/^[0-9a-f]{40}$/.test(revision)) {
      throw new Error("Expected a full commit SHA");
    }
    if (git(["cat-file", "-t", revision]).trim() !== "commit") {
      throw new Error("Expected a commit object");
    }
  }
  const mergeBases = git(["merge-base", "--all", base!, head!])
    .trim()
    .split("\n");
  if (mergeBases.length !== 1 || !/^[0-9a-f]{40}$/.test(mergeBases[0])) {
    throw new Error("Expected exactly one merge base");
  }
  return classifyDiff(
    git([
      "diff",
      "--name-status",
      "-z",
      "--find-renames",
      mergeBases[0],
      head!,
      "--",
    ]),
  );
}

if (import.meta.main) {
  try {
    const docsOnly = classifyChanges(
      process.cwd(),
      process.env.CI_EVENT_NAME,
      process.env.CI_BASE_SHA,
      process.env.CI_HEAD_SHA,
    );
    if (!process.env.GITHUB_OUTPUT || !process.env.GITHUB_STEP_SUMMARY) {
      throw new Error("Actions output and summary paths are required");
    }
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## E2E change classification\n\nDocumentation-only: **${docsOnly}**\n\n${
        docsOnly
          ? "Both E2E shards are intentionally skipped. All other required checks still run."
          : "Both E2E shards are required."
      }\n`,
    );
    // Publish only after all classification and reporting operations succeeded.
    appendFileSync(process.env.GITHUB_OUTPUT, `docs_only=${docsOnly}\n`);
  } catch (error) {
    console.error(
      "Change classification failed:",
      error instanceof Error ? error.message : error,
    );
    process.exitCode = 1;
  }
}
