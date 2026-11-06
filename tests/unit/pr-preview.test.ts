import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  configs,
  names,
  previewUrl,
  selectDatabase,
} from "../../scripts/pr-preview-policy.ts";
import { pages, request, wrangler } from "../../scripts/pr-preview-api.ts";

vi.mock("../../scripts/pr-preview-api.ts", () => ({
  pages: vi.fn(),
  request: vi.fn(),
  wrangler: vi.fn(),
}));
const uuid = "11111111-1111-4111-8111-111111111111";
const db = { name: "yosan-flow-pr-123", uuid };
const parent = JSON.parse(readFileSync("wrangler.pr-preview.json", "utf8"));
const argv = process.argv;
let directory: string;
let remoteDatabases: (typeof db)[];
let state: {
  state: string;
  head: { sha: string; repo: { full_name: string } };
};
let event: Record<string, unknown>;
let previewExists: boolean;
let commands: string[][];
let output: string;
let generated: ReturnType<typeof configs> | undefined;

function databaseRequest(path: string, method: string, body: unknown) {
  if (path.endsWith("/d1/database") && method === "POST") {
    remoteDatabases.push({ ...db, ...(body as object) });
    return db;
  }
  if (path.endsWith(`/d1/database/${uuid}`)) {
    if (method === "DELETE") remoteDatabases = [];
    return db;
  }
  throw new Error("Unexpected database fake request");
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  directory = mkdtempSync(join(tmpdir(), "yosan-preview-test-"));
  output = join(directory, "output");
  writeFileSync(output, "");
  vi.stubEnv("GITHUB_REPOSITORY", "sh4869221b/yosan-flow");
  vi.stubEnv("GITHUB_EVENT_PATH", join(directory, "event.json"));
  vi.stubEnv("GITHUB_OUTPUT", output);
  vi.stubEnv("GITHUB_EVENT_NAME", "workflow_run");
  vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "a".repeat(32));
  vi.stubEnv("PR_NUMBER", "123");
  vi.stubEnv("PR_SHA", "latest-sha");
  vi.stubEnv("PR_PREVIEW_MAX_DATABASES", "10");
  state = {
    state: "open",
    head: { sha: "latest-sha", repo: { full_name: "sh4869221b/yosan-flow" } },
  };
  event = {};
  remoteDatabases = [];
  previewExists = false;
  commands = [];
  generated = undefined;
  vi.mocked(pages).mockImplementation(async (path) => {
    if (path.includes("d1/database")) return remoteDatabases;
    if (path.includes("/jobs"))
      return [{ name: "Quality checks", conclusion: "success" }];
    return [];
  });
  vi.mocked(request).mockImplementation(async (path, method = "GET", body) => {
    if (path.includes("/pulls/123")) return structuredClone(state);
    if (path.endsWith("/deployments/latest")) return null;
    if (path.endsWith("/previews/pr-123"))
      return previewExists ? { name: "pr-123", id: uuid } : null;
    if (path.includes("/d1/database"))
      return databaseRequest(path, method, body);
    if (path.includes("/comments")) return {};
    throw new Error(`Unexpected fake API: ${method} ${path}`);
  });
  vi.mocked(wrangler).mockImplementation((args) => {
    commands.push(args);
    if (args[0] === "d1") {
      const migration = JSON.parse(readFileSync(args.at(-1)!, "utf8"));
      const preview = JSON.parse(
        readFileSync(".tmp-pr-preview-123.json", "utf8"),
      );
      generated = { migration, preview };
    }
    if (args[0] === "preview" && args[1] === "--name") previewExists = true;
    if (args[1] === "delete") previewExists = false;
    return JSON.stringify({
      preview: { urls: ["https://pr-123-yosan-flow-pr.test.workers.dev"] },
    });
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.endsWith("/api/periods")
        ? Response.json({ periods: [] })
        : new Response(
            '<main class="dashboard-page"><h1>最初の予算期間を作成</h1></main>',
            {
              headers: { "content-type": "text/html" },
            },
          ),
    ),
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  process.argv = argv;
  process.exitCode = 0;
  for (const path of [".tmp-pr-preview-123.json", ".tmp-pr-migration-123.json"])
    rmSync(path, { force: true });
  rmSync(directory, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function run(mode: string) {
  writeFileSync(join(directory, "event.json"), JSON.stringify(event));
  process.argv = [argv[0], "scripts/pr-preview.ts", mode];
  await import("../../scripts/pr-preview.ts");
}
function successfulCI() {
  return {
    workflow_run: {
      event: "pull_request",
      conclusion: "success",
      path: ".github/workflows/ci.yml",
      head_repository: { full_name: "sh4869221b/yosan-flow" },
      head_sha: "latest-sha",
      pull_requests: [{ number: 123 }],
      id: 1,
      run_attempt: 1,
    },
  };
}

describe("PR Preview isolation policy", () => {
  it("rejects invalid identities and shared/protected UUIDs", () => {
    for (const value of [0, -1, 1.5, NaN]) expect(() => names(value)).toThrow();
    expect(() => selectDatabase(123, [db], [uuid])).toThrow("Protected");
    expect(() =>
      selectDatabase(123, [db, { ...db, name: "yosan-flow-pr-124" }], []),
    ).toThrow("Shared");
    expect(() => selectDatabase(123, [db, db], [])).toThrow("Ambiguous");
    expect(selectDatabase(124, [db], [])).toBeUndefined();
  });
  it("generates identical migration/Preview bindings without production inheritance", () => {
    const result = configs(123, db, {
      ...parent,
      vars: { SECRET: "never" },
      d1_databases: [{ database_id: "production" }],
    });
    expect(result.preview.previews.d1_databases).toEqual(
      result.migration.d1_databases,
    );
    expect(result.preview).not.toHaveProperty("d1_databases");
    expect(JSON.stringify(result)).not.toMatch(/SECRET|production|E2E/);
    expect(
      configs(124, { ...db, name: "yosan-flow-pr-124" }, parent).preview
        .previews.d1_databases[0].database_name,
    ).not.toBe(db.name);
  });
  it("rejects other PR URLs, redirects and unrelated origins", () => {
    for (const value of [
      "https://pr-124-yosan-flow-pr.test.workers.dev",
      "https://evil.test/",
      "https://pr-123-yosan-flow-pr.test.workers.dev/?x",
      "http://pr-123-yosan-flow-pr.test.workers.dev/",
    ])
      expect(() => previewUrl(123, value)).toThrow();
  });
});

describe("PR Preview lifecycle with fake APIs and CLI", () => {
  it("requires successful CI Quality checks at the current same-repo HEAD", async () => {
    event = successfulCI();
    await run("resolve");
    expect(readFileSync(output, "utf8")).toContain("action=deploy");
  });
  it.each(["fork", "failed", "stale", "missing-quality"])(
    "skips %s without Cloudflare calls",
    async (reason) => {
      event = successfulCI();
      if (reason === "fork") state.head.repo.full_name = "contributor/fork";
      if (reason === "stale") state.head.sha = "new-head";
      if (reason === "failed")
        (event.workflow_run as { conclusion: string }).conclusion = "failure";
      if (reason === "missing-quality") vi.mocked(pages).mockResolvedValue([]);
      await run("resolve");
      expect(readFileSync(output, "utf8")).toBe("");
      expect(commands).toEqual([]);
      expect(
        vi
          .mocked(request)
          .mock.calls.every(([path]) => !path.startsWith("/accounts/")),
      ).toBe(true);
    },
  );
  it("creates isolated D1, migrates before deploy and probes the public app/API", async () => {
    await run("deploy");
    expect(commands.map((args) => args[0])).toEqual(["d1", "preview"]);
    expect(generated!.migration.d1_databases).toEqual(
      generated!.preview.previews.d1_databases,
    );
    expect(commands[1]).toContain("--ignore-base-config");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(readFileSync(output, "utf8")).toContain(
      "url=https://pr-123-yosan-flow-pr.test.workers.dev",
    );
  });
  it("reuses the PR database on additional pushes", async () => {
    remoteDatabases = [db];
    await run("deploy");
    expect(
      vi
        .mocked(request)
        .mock.calls.some(
          ([path, method]) =>
            path.endsWith("/d1/database") && method === "POST",
        ),
    ).toBe(false);
    expect(generated!.preview.previews.d1_databases[0].database_id).toBe(uuid);
  });
  it("does not deploy when migration fails", async () => {
    vi.mocked(wrangler).mockImplementation(() => {
      throw new Error("migration failed");
    });
    await run("deploy");
    expect(wrangler).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(1);
    expect(readFileSync(output, "utf8")).toContain("failure=migration");
  });
  it("fails closed on unexpected inherited secrets", async () => {
    const original = vi.mocked(request).getMockImplementation()!;
    vi.mocked(request).mockImplementation(async (...args) =>
      args[0].endsWith("/deployments/latest")
        ? { env: { SECRET: { type: "secret_text" } } }
        : original(...args),
    );
    await run("deploy");
    expect(commands).toEqual([]);
    expect(process.exitCode).toBe(1);
  });
  it("handles quota failure without deploying", async () => {
    vi.stubEnv("PR_PREVIEW_MAX_DATABASES", "1");
    remoteDatabases = [{ ...db, name: "yosan-flow-pr-124" }];
    await run("deploy");
    expect(process.exitCode).toBe(1);
    expect(commands).toEqual([]);
  });
  it("deletes only the closed PR Preview and verified D1 UUID", async () => {
    state.state = "closed";
    remoteDatabases = [db];
    previewExists = true;
    await run("cleanup");
    expect(commands[0]).toContain("delete");
    expect(commands[0]).toContain("pr-123");
    expect(vi.mocked(request).mock.calls).toContainEqual([
      expect.stringContaining(uuid),
      "DELETE",
    ]);
    expect(remoteDatabases).toEqual([]);
  });
  it("retains D1 when Preview deletion fails, so cleanup can be retried", async () => {
    state.state = "closed";
    remoteDatabases = [db];
    previewExists = true;
    vi.mocked(wrangler).mockImplementation(() => {
      throw new Error("delete failed");
    });
    await run("cleanup");
    expect(process.exitCode).toBe(1);
    expect(remoteDatabases).toEqual([db]);
    expect(
      vi.mocked(request).mock.calls.some(([, method]) => method === "DELETE"),
    ).toBe(false);
  });
  it("refuses cleanup of a protected production UUID even with a matching PR name", async () => {
    state.state = "closed";
    remoteDatabases = [{ ...db, uuid: "243d7022-5343-40d4-82dc-cef427eba406" }];
    await run("cleanup");
    expect(process.exitCode).toBe(1);
    expect(
      vi.mocked(request).mock.calls.some(([, method]) => method === "DELETE"),
    ).toBe(false);
  });
  it("makes already absent cleanup a no-op", async () => {
    state.state = "closed";
    await run("cleanup");
    expect(commands).toEqual([]);
    expect(process.exitCode).not.toBe(1);
  });
  it("does not remove a reopened PR", async () => {
    previewExists = true;
    remoteDatabases = [db];
    await run("cleanup");
    expect(commands).toEqual([]);
    expect(remoteDatabases).toEqual([db]);
  });
  it("cleans up instead of deploying when close occurs after migration", async () => {
    const original = vi.mocked(wrangler).getMockImplementation()!;
    vi.mocked(wrangler).mockImplementation((args) => {
      const result = original(args);
      if (args[0] === "d1") state.state = "closed";
      return result;
    });
    await run("deploy");
    expect(
      commands.some((args) => args[0] === "preview" && args[1] === "--name"),
    ).toBe(false);
    expect(remoteDatabases).toEqual([]);
  });
  it("reports a safe D1/quota failure reason in the PR comment", async () => {
    vi.stubEnv("PREVIEW_STATUS", "failure");
    vi.stubEnv("PREVIEW_FAILURE", "database");
    await run("report");
    expect(vi.mocked(request).mock.calls).toContainEqual([
      expect.stringContaining("/issues/123/comments"),
      "POST",
      { body: expect.stringContaining("D1準備・上限確認") },
    ]);
  });
  it("updates only the marked bot comment", async () => {
    vi.stubEnv("PREVIEW_STATUS", "success");
    vi.stubEnv("PREVIEW_URL", "https://pr-123-yosan-flow-pr.test.workers.dev");
    vi.mocked(pages).mockResolvedValue([
      {
        id: 99,
        user: { login: "github-actions[bot]" },
        body: "<!-- yosan-flow-pr-preview --> old",
      },
    ]);
    await run("report");
    expect(vi.mocked(request).mock.calls).toContainEqual([
      expect.stringContaining("/issues/comments/99"),
      "PATCH",
      { body: expect.stringContaining("公開URL:") },
    ]);
  });
});
