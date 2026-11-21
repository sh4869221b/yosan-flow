import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// Remote JSON is checked at each use; never log or forward whole responses.
export async function request(
  path: string,
  method = "GET",
  body?: unknown,
  missingCodes: number[] = [],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const cloudflare = path.startsWith("/accounts/");
  const token = process.env[cloudflare ? "CLOUDFLARE_API_TOKEN" : "GH_TOKEN"];
  assert(token, "Missing API credential");
  const response = await fetch(
    `${cloudflare ? "https://api.cloudflare.com/client/v4" : "https://api.github.com"}${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    },
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await response.json()) as any;
  // Only explicit resource-not-found codes are idempotent.
  if (
    response.status === 404 &&
    cloudflare &&
    isMissing(data.errors, missingCodes)
  )
    return null;
  assert(
    response.ok && (!cloudflare || data.success),
    `API ${method} failed (HTTP ${response.status})`,
  );
  return cloudflare ? data.result : data;
}

function isMissing(errors: { code: number }[] | undefined, codes: number[]) {
  return errors?.some((error) => codes.includes(error.code)) === true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function pages(path: string, key?: string): Promise<any[]> {
  const result = [];
  for (let page = 1; ; page++) {
    const data = await request(
      `${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`,
    );
    const items = key ? data[key] : data;
    assert(Array.isArray(items), "Invalid paginated response");
    result.push(...items);
    if (items.length < 100) return result;
  }
}

export function wrangler(args: string[]) {
  try {
    return execFileSync("pnpm", ["exec", "wrangler", ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false" },
    });
  } catch {
    // Never publish raw CLI output: it may contain user data, SQL or secrets.
    throw new Error(
      `Wrangler ${args.slice(0, 3).join(" ")} failed; inspect Cloudflare resource status before retrying`,
    );
  }
}
