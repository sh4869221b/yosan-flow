import path from "node:path";
import { mkdir, rm } from "node:fs/promises";
import {
  execFile,
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import type { APIRequestContext, Browser } from "@playwright/test";

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 4173;
export const TEST_TIMEOUT_MS = 90_000;
export const WORKDIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const execFileAsync = promisify(execFile);

let devServer: ChildProcessWithoutNullStreams | null = null;
const baseUrl = `http://${DEFAULT_HOST}:${DEFAULT_PORT}`;
const apiServicesCacheKey = Symbol.for("yosan-flow.api-services-cache");
const LOCAL_PERSIST_DIR = path.join(WORKDIR, ".tmp-wrangler-state");

export function getBaseUrl(): string {
  return baseUrl;
}

export function getCurrentJstDate(): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "2026";
  const month = parts.find((part) => part.type === "month")?.value ?? "04";
  const day = parts.find((part) => part.type === "day")?.value ?? "20";
  return `${year}-${month}-${day}`;
}

export function addDays(date: string, days: number): string {
  const dateValue = Date.parse(`${date}T00:00:00.000Z`);
  return new Date(dateValue + days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

async function waitForServerReady(url: string): Promise<void> {
  const deadline = Date.now() + TEST_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status === 404) {
        return;
      }
    } catch {
      // Ignore until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for dev server: ${url}`);
}

async function warmUpApp(url: string): Promise<void> {
  await fetch(url);
  await new Promise((resolve) => setTimeout(resolve, 500));
}

async function buildWorkerBundle(): Promise<void> {
  await execFileAsync(
    "bash",
    [
      "-lc",
      "COREPACK_HOME=/tmp/corepack PNPM_HOME=/tmp/pnpm XDG_DATA_HOME=/tmp corepack pnpm build",
    ],
    {
      cwd: WORKDIR,
      env: {
        ...process.env,
      },
    },
  );
}

function resetInMemoryApiServicesCache(): void {
  const runtimeHost =
    (globalThis as { process?: unknown }).process ?? (globalThis as unknown);
  const cacheHost = runtimeHost as Record<string | symbol, unknown>;
  delete cacheHost[apiServicesCacheKey];
}

export async function startDevServer(): Promise<void> {
  if (devServer) {
    return;
  }

  const xdgConfigHome = path.join(WORKDIR, ".tmp-xdg-config");
  await mkdir(path.join(xdgConfigHome, ".wrangler", "logs"), {
    recursive: true,
  });
  await rm(LOCAL_PERSIST_DIR, { recursive: true, force: true });
  await mkdir(LOCAL_PERSIST_DIR, { recursive: true });
  process.env.XDG_CONFIG_HOME = xdgConfigHome;
  resetInMemoryApiServicesCache();
  await buildWorkerBundle();

  devServer = spawn(
    "bash",
    [
      "-lc",
      `COREPACK_HOME=/tmp/corepack PNPM_HOME=/tmp/pnpm XDG_DATA_HOME=/tmp corepack pnpm wrangler dev --local --persist-to ${LOCAL_PERSIST_DIR} --ip ${DEFAULT_HOST} --port ${DEFAULT_PORT}`,
    ],
    {
      cwd: WORKDIR,
      env: {
        ...process.env,
        XDG_CONFIG_HOME: xdgConfigHome,
      },
      stdio: "pipe",
    },
  );

  await waitForServerReady(`${baseUrl}/`);
  await warmUpApp(`${baseUrl}/`);
}

export async function stopDevServer(): Promise<void> {
  if (!devServer) {
    return;
  }

  const server = devServer;
  devServer = null;
  await new Promise<void>((resolve) => {
    server.once("exit", () => resolve());
    server.kill("SIGINT");
  });
}

export async function warmUpBrowser(browser: Browser): Promise<void> {
  const page = await browser.newPage();
  try {
    await page.goto(`${baseUrl}/`);
    await page.waitForTimeout(500);
  } finally {
    await page.close();
  }
}

export async function fetchPeriods(request: APIRequestContext) {
  const response = await request.get(`${baseUrl}/api/periods`);
  if (!response.ok()) {
    throw new Error(`Failed to fetch periods: ${response.status()}`);
  }
  const body = await response.json();
  return body.periods as Array<{
    id: string;
    startDate: string;
    endDate: string;
  }>;
}

export async function fetchPeriodSummary(
  request: APIRequestContext,
  periodId: string,
) {
  const response = await request.get(
    `${baseUrl}/api/periods/${encodeURIComponent(periodId)}`,
  );
  if (!response.ok()) {
    throw new Error(
      `Failed to fetch period summary for ${periodId}: ${response.status()}`,
    );
  }
  return (await response.json()) as {
    periodId: string;
    dailyRows: Array<{ date: string; label: "today" | "planned" }>;
  };
}
