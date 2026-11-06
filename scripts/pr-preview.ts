import assert from "node:assert/strict";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import {
  configs,
  names,
  previewUrl,
  selectDatabase,
  workerName,
} from "./pr-preview-policy.ts";
import { pages, request, wrangler } from "./pr-preview-api.ts";
import type { Database } from "./pr-preview-policy.ts";

const repo = process.env.GITHUB_REPOSITORY;
assert(repo === "sh4869221b/yosan-flow", "Unexpected repository");
const repository = `/repos/${repo}`;
const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH!, "utf8"));
const mode = process.argv[2];
const parent = JSON.parse(
  readFileSync(new URL("../wrangler.pr-preview.json", import.meta.url), "utf8"),
);
const protectedIds = [
  ...readFileSync(
    new URL("../wrangler.jsonc", import.meta.url),
    "utf8",
  ).matchAll(/"database_id":\s*"([^"]+)"/g),
].map((m) => m[1]);
assert(protectedIds.length >= 3, "Missing protected database IDs");
const marker = "<!-- yosan-flow-pr-preview -->";
const failureLabels = {
  prepare: "設定・PR状態の確認",
  database: "D1準備・上限確認（API権限・quotaも確認してください）",
  isolation: "Previewのbinding・secret分離確認",
  migration: "PR専用D1のmigration適用",
  deploy: "Worker Preview配備",
  probe: "公開URLの画面・D1 API確認",
  cleanup: "Preview・PR専用D1の削除",
};
let stage: keyof typeof failureLabels = "prepare";
function output(key: string, value: string | number) {
  appendFileSync(process.env.GITHUB_OUTPUT!, `${key}=${value}\n`);
}
async function pr(number: number) {
  names(number);
  return request(`${repository}/pulls/${number}`);
}

async function ciTarget() {
  const run = event.workflow_run;
  if (run.event !== "pull_request" || run.conclusion !== "success") return;
  if (
    run.path !== ".github/workflows/ci.yml" ||
    run.head_repository.full_name !== repo
  )
    return;
  const candidates = run.pull_requests.length
    ? run.pull_requests
    : await pages(`${repository}/commits/${run.head_sha}/pulls`);
  if (candidates.length !== 1) return;
  const jobs = await pages(
    `${repository}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs`,
    "jobs",
  );
  if (
    !jobs.some(
      (job) => job.name === "Quality checks" && job.conclusion === "success",
    )
  )
    return;
  return { number: candidates[0].number, sha: run.head_sha, action: "deploy" };
}
async function resolve() {
  let target;
  if (event.workflow_run) target = await ciTarget();
  else {
    assert(
      process.env.GITHUB_EVENT_NAME === "pull_request_target" &&
        event.action === "closed",
      "Unexpected trigger",
    );
    target = {
      number: event.pull_request.number,
      sha: event.pull_request.head.sha,
      action: "cleanup",
    };
  }
  if (!target || !(await eligibleTarget(target))) return;
  for (const [key, value] of Object.entries(target)) output(key, value);
}
async function eligibleTarget(target: {
  number: number;
  sha: string;
  action: string;
}) {
  const value = await pr(target.number);
  if (value.head.repo?.full_name !== repo) return false;
  if (target.action === "cleanup") return value.state === "closed";
  return value.state === "open" && value.head.sha === target.sha;
}

function resources(number: number) {
  const { preview, database } = names(number);
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  assert(
    account && /^[a-f0-9]{32}$/i.test(account),
    "Missing/invalid Cloudflare account ID",
  );
  const accountPath = `/accounts/${account}`;
  const databases = () =>
    pages(`${accountPath}/d1/database`) as Promise<Database[]>;
  const find = async () =>
    selectDatabase(number, await databases(), protectedIds);
  return {
    number,
    preview,
    database,
    accountPath,
    databases,
    find,
    previewPath: `${accountPath}/workers/workers/${workerName}/previews/${preview}`,
    configPath: `.tmp-pr-preview-${number}.json`,
    migrationPath: `.tmp-pr-migration-${number}.json`,
  };
}
type Resources = ReturnType<typeof resources>;
async function cleanup(target: Resources) {
  stage = "cleanup";
  writeFileSync(target.configPath, JSON.stringify(parent));
  const existing = await request(
    target.previewPath,
    "GET",
    undefined,
    [10025, 10007],
  );
  if (existing) {
    assert(
      existing.name === target.preview &&
        typeof existing.id === "string" &&
        existing.id.length > 0,
      "Unexpected Preview identity",
    );
    wrangler([
      "preview",
      "delete",
      "--name",
      target.preview,
      "--skip-confirmation",
      "--config",
      target.configPath,
    ]);
  }
  const db = await target.find();
  if (!db) return;
  const actual = await request(`${target.accountPath}/d1/database/${db.uuid}`);
  assert(
    actual.uuid === db.uuid && actual.name === target.database,
    "Database identity changed",
  );
  await request(`${target.accountPath}/d1/database/${db.uuid}`, "DELETE");
}
async function current(target: Resources) {
  const value = await pr(target.number);
  if (value.state === "closed") {
    await cleanup(target);
    return false;
  }
  return (
    value.head.repo?.full_name === repo && value.head.sha === process.env.PR_SHA
  );
}
async function ensureDatabase(target: Resources) {
  const existing = await target.find();
  if (existing) return existing;
  const all = await target.databases();
  const limit = Number(process.env.PR_PREVIEW_MAX_DATABASES || "10");
  assert(
    Number.isSafeInteger(limit) && limit > 0,
    "Invalid Preview database limit",
  );
  assert(
    all.filter((item) => /^yosan-flow-pr-[1-9][0-9]*$/.test(item.name)).length <
      limit,
    "Preview database budget reached; close PRs or review quota",
  );
  await request(`${target.accountPath}/d1/database`, "POST", {
    name: target.database,
  });
  const created = await target.find();
  assert(created, "Created database not found; retry after inventory check");
  return created;
}
async function validateLatest(target: Resources, db: Database) {
  // Refuse inherited secrets or unexpected bindings, including manually altered previews.
  const latest = await request(
    `${target.previewPath}/deployments/latest`,
    "GET",
    undefined,
    [10025, 10007, 10222],
  );
  if (!latest) return;
  for (const [name, binding] of Object.entries(latest.env ?? {}) as [
    string,
    { type: string; id?: string },
  ][]) {
    assert(
      (name === "DB" && binding.type === "d1" && binding.id === db.uuid) ||
        (name === "ASSETS" && binding.type === "assets"),
      "Unexpected existing Preview binding/secret",
    );
  }
}
async function probeResponse(url: string, path: string) {
  const response = await fetch(`${url}${path}`, {
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status !== 200) return false;
  if (path === "/")
    return (
      response.headers.get("content-type")?.includes("text/html") === true &&
      (await response.text()).includes('<main class="dashboard-page"')
    );
  const body = (await response.json()) as { periods?: unknown };
  return Array.isArray(body.periods);
}
async function probe(url: string) {
  for (const path of ["/", "/api/periods"]) {
    let ok = false;
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        ok = await probeResponse(url, path);
      } catch {
        /* Retry DNS/deployment propagation, without credentials or redirects. */
      }
      if (ok) break;
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
    assert(ok, `Public Preview probe failed: ${path}`);
  }
}
async function operate(number: number) {
  const target = resources(number);
  if (mode === "cleanup") {
    if ((await pr(number)).state === "closed") await cleanup(target);
    return;
  }
  if (!(await current(target))) return;
  stage = "database";
  const db = await ensureDatabase(target);
  const generated = configs(number, db, parent);
  writeFileSync(target.configPath, JSON.stringify(generated.preview));
  writeFileSync(target.migrationPath, JSON.stringify(generated.migration));
  stage = "isolation";
  await validateLatest(target, db);
  if (!(await current(target))) return;
  stage = "migration";
  wrangler([
    "d1",
    "migrations",
    "apply",
    "DB",
    "--remote",
    "--config",
    target.migrationPath,
  ]);
  if (!(await current(target))) return;
  stage = "deploy";
  const deployed = JSON.parse(
    wrangler([
      "preview",
      "--name",
      target.preview,
      "--config",
      target.configPath,
      "--ignore-base-config",
      "--json",
    ]),
  );
  const url = previewUrl(number, deployed.preview.urls[0]);
  if (!(await current(target))) return;
  stage = "probe";
  await probe(url);
  if (await current(target)) output("url", url);
}

function reportStatus(closed: boolean, url: string | undefined) {
  if (process.env.PREVIEW_STATUS !== "success")
    return `失敗箇所: ${failureLabels[process.env.PREVIEW_FAILURE as keyof typeof failureLabels] ?? "checkout・依存関係・build等（実行ログ参照）"}。直前のPreviewが残っている可能性があります。下記runとリソース状況を確認してください。`;
  if (closed) return "Previewと専用D1を削除しました。";
  if (url)
    return `公開URL: ${url}\n\n公開の使い捨てデータです。実際の個人情報は入力しないでください。`;
  return "配備を見送りました。runと現在のPR状態を確認してください。";
}

async function report(number: number) {
  const current = await pr(number);
  const closed = current.state === "closed";
  if (!closed && current.head.sha !== process.env.PR_SHA) return;
  const url = process.env.PREVIEW_URL
    ? previewUrl(number, process.env.PREVIEW_URL)
    : undefined;
  const body = `${marker}\n### PR Preview\n${reportStatus(closed, url)}\n\nSHA: \`${process.env.PR_SHA}\` / Preview: \`${names(number).preview}\`\n\n[実行ログ](https://github.com/${repo}/actions/runs/${process.env.GITHUB_RUN_ID})`;
  const comments = await pages(`${repository}/issues/${number}/comments`);
  const existing = comments.find(
    (comment) =>
      comment.user.login === "github-actions[bot]" &&
      comment.body.startsWith(marker),
  );
  await request(
    existing
      ? `${repository}/issues/comments/${existing.id}`
      : `${repository}/issues/${number}/comments`,
    existing ? "PATCH" : "POST",
    { body },
  );
}

try {
  if (mode === "resolve") await resolve();
  else if (mode === "report") await report(Number(process.env.PR_NUMBER));
  else {
    assert(mode === "deploy" || mode === "cleanup");
    await operate(Number(process.env.PR_NUMBER));
  }
} catch (error) {
  if (mode === "deploy" || mode === "cleanup") output("failure", stage);
  // Assertion messages are authored here; raw remote error bodies never reach logs/comments.
  console.error(
    error instanceof Error ? error.message : "Preview operation failed",
  );
  process.exitCode = 1;
}
