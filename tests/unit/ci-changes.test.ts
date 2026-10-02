import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { classifyChanges, classifyDiff } from "../../scripts/ci-changes";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function temporary() {
  const path = mkdtempSync(join(tmpdir(), "ci-changes-"));
  directories.push(path);
  return path;
}
function repository() {
  const cwd = temporary();
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  git("init", "--quiet");
  git("config", "user.name", "CI fixture");
  git("config", "user.email", "ci@example.invalid");
  const write = (path: string, body: string) => {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), body);
  };
  const commit = () => {
    git("add", "--all");
    git("commit", "--quiet", "-m", "fixture");
    return git("rev-parse", "HEAD");
  };
  write("README.md", "Documentation\n");
  write("app.ts", "export const n = 1;\n");
  const base = commit();
  return { cwd, git, write, commit, base };
}

describe("documentation allowlist and NUL parser", () => {
  it.each([
    "README.md",
    "CONTRIBUTING.md",
    "DESIGN.md",
    "tooling/fallow/README.md",
    "tooling/ci/check.md",
    "tooling/ci/nested/notes.md",
  ])("allows %s", (path) => {
    expect(classifyDiff(`M\0${path}\0`)).toBe(true);
  });
  it.each([
    "static/help.md",
    "src/app.ts",
    "tests/README.md",
    "AGENTS.md",
    ".github/workflows/ci.yml",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    ".node_version",
    "wrangler.jsonc",
    "playwright.config.ts",
    "vite.config.ts",
    "scripts/ci-changes.ts",
    "migrations/0001.sql",
    "tooling/fallow/health-baseline.json",
    "tooling/ci/../app.md",
    "tooling/ci//notes.md",
    "/README.md",
    "other.md",
    "tooling/ci/script.ts",
    "tooling/ci/.git/config",
  ])("requires E2E for %s", (path) => {
    expect(classifyDiff(`M\0README.md\0M\0${path}\0`)).toBe(false);
  });
  it("checks both rename endpoints, deletion, and type changes", () => {
    expect(classifyDiff("R100\0README.md\0tooling/ci/moved.md\0")).toBe(true);
    expect(classifyDiff("R050\0README.md\0tooling/ci/moved.md\0")).toBe(true);
    expect(classifyDiff("R100\0app.ts\0tooling/ci/moved.md\0")).toBe(false);
    expect(classifyDiff("R100\0README.md\0static/moved.md\0")).toBe(false);
    expect(classifyDiff("D\0app.ts\0")).toBe(false);
    expect(classifyDiff("T\0README.md\0")).toBe(false);
  });
  it("does not evaluate shell syntax, whitespace or newlines in filenames", () => {
    expect(classifyDiff("A\0static/$(touch exploit)\nREADME.md\0")).toBe(false);
    expect(classifyDiff("A\0tooling/ci/$(touch exploit)\nnotes.md\0")).toBe(
      true,
    );
  });
  it.each([
    "",
    "M\0README.md",
    "M\0",
    "R100\0README.md\0",
    "R101\0README.md\0DESIGN.md\0",
    "C100\0README.md\0DESIGN.md\0",
    "U\0README.md\0",
    "M\0README.md\0oops\0",
    "M\0README.md\0\0",
  ])("rejects incomplete/unknown diff %j", (diff) => {
    expect(() => classifyDiff(diff)).toThrow();
  });
});

describe("actual Git full-PR diff and CLI", () => {
  it("classifies the whole PR, not a docs-only latest commit", () => {
    const repo = repository();
    repo.write("app.ts", "export const n = 2;\n");
    repo.commit();
    repo.write("README.md", "Latest docs change\n");
    expect(
      classifyChanges(repo.cwd, "pull_request", repo.base, repo.commit()),
    ).toBe(false);
  });
  it("uses the merge base without including unrelated base-branch changes", () => {
    const repo = repository();
    repo.git("checkout", "-q", "-b", "base-advance");
    repo.write("app.ts", "export const n = 2;\n");
    const advancedBase = repo.commit();
    repo.git("checkout", "-q", "--detach", repo.base);
    repo.write("README.md", "Updated docs\n");
    expect(
      classifyChanges(repo.cwd, "pull_request", advancedBase, repo.commit()),
    ).toBe(true);
  });
  it.each([true, false])("handles actual Git renames, docs=%s", (docs) => {
    const repo = repository();
    mkdirSync(join(repo.cwd, "tooling/ci"), { recursive: true });
    repo.git("mv", docs ? "README.md" : "app.ts", "tooling/ci/moved.md");
    expect(
      classifyChanges(repo.cwd, "pull_request", repo.base, repo.commit()),
    ).toBe(docs);
  });
  it("rejects empty, missing, invalid, noncommit, and shallow history", () => {
    const repo = repository();
    expect(() =>
      classifyChanges(repo.cwd, "pull_request", repo.base, repo.base),
    ).toThrow();
    for (const base of [
      undefined,
      "HEAD",
      "-h",
      "0".repeat(40),
      repo.git("rev-parse", "HEAD^{tree}"),
    ]) {
      expect(() =>
        classifyChanges(repo.cwd, "pull_request", base, repo.base),
      ).toThrow();
    }
    const shallow = temporary();
    execFileSync("git", [
      "clone",
      "--quiet",
      "--depth=1",
      `file://${repo.cwd}`,
      shallow,
    ]);
    expect(() =>
      classifyChanges(shallow, "pull_request", repo.base, repo.base),
    ).toThrow(/history/);
  });
  it("never skips main pushes; rejects unknown events", () => {
    expect(
      classifyChanges("/does-not-exist", "push", undefined, undefined),
    ).toBe(false);
    expect(() =>
      classifyChanges(
        "/does-not-exist",
        "workflow_dispatch",
        undefined,
        undefined,
      ),
    ).toThrow();
  });
  it("publishes exact output only on a successful CLI classification", () => {
    const repo = repository();
    repo.write("README.md", "New documentation\n");
    const head = repo.commit();
    const output = join(temporary(), "output");
    const summary = join(temporary(), "summary");
    const run = (base: string) =>
      spawnSync(process.execPath, [resolve("scripts/ci-changes.ts")], {
        cwd: repo.cwd,
        encoding: "utf8",
        env: {
          ...process.env,
          CI_EVENT_NAME: "pull_request",
          CI_BASE_SHA: base,
          CI_HEAD_SHA: head,
          GITHUB_OUTPUT: output,
          GITHUB_STEP_SUMMARY: summary,
        },
      });
    expect(run(repo.base).status).toBe(0);
    expect(readFileSync(output, "utf8")).toBe("docs_only=true\n");
    expect(readFileSync(summary, "utf8")).toContain("intentionally skipped");
    writeFileSync(output, "");
    expect(run("missing").status).toBe(1);
    expect(readFileSync(output, "utf8")).toBe("");
  });
});
