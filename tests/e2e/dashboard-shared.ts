import path from "node:path";
import { mkdir, rm } from "node:fs/promises";
import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import type { APIRequestContext, Browser } from "@playwright/test";

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 4173;
export const TEST_TIMEOUT_MS = 90_000;
export const WORKDIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const execFileAsync = promisify(execFile);

let devServer: ChildProcessWithoutNullStreams | null = null;
let baseUrl = `http://${DEFAULT_HOST}:${DEFAULT_PORT}`;
const apiServicesCacheKey = Symbol.for("yosan-flow.api-services-cache");
const LOCAL_PERSIST_DIR = path.join(WORKDIR, ".tmp-wrangler-state");

export function getBaseUrl(): string {
  return baseUrl;
}

export function toYearMonth(year: number, month: number): string {
  const normalizedYear = year + Math.floor((month - 1) / 12);
  const normalizedMonth = ((month - 1) % 12) + 1;
  return `${normalizedYear}-${String(normalizedMonth).padStart(2, "0")}`;
}

export function monthOffset(base: string, offset: number): string {
  const [year, month] = base.split("-").map(Number);
  return toYearMonth(year, month + offset);
}

export function getCurrentJstYearMonth(): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit"
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "2026";
  const month = parts.find((part) => part.type === "month")?.value ?? "04";
  return `${year}-${month}`;
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
      "COREPACK_HOME=/tmp/corepack PNPM_HOME=/tmp/pnpm XDG_DATA_HOME=/tmp corepack pnpm build"
    ],
    {
      cwd: WORKDIR,
      env: {
        ...process.env
      }
    }
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
  await mkdir(path.join(xdgConfigHome, ".wrangler", "logs"), { recursive: true });
  await rm(LOCAL_PERSIST_DIR, { recursive: true, force: true });
  await mkdir(LOCAL_PERSIST_DIR, { recursive: true });
  process.env.XDG_CONFIG_HOME = xdgConfigHome;
  resetInMemoryApiServicesCache();
  await buildWorkerBundle();

  devServer = spawn(
    "bash",
    [
      "-lc",
      `COREPACK_HOME=/tmp/corepack PNPM_HOME=/tmp/pnpm XDG_DATA_HOME=/tmp corepack pnpm wrangler dev --local --persist-to ${LOCAL_PERSIST_DIR} --ip ${DEFAULT_HOST} --port ${DEFAULT_PORT}`
    ],
    {
      cwd: WORKDIR,
      env: {
        ...process.env,
        XDG_CONFIG_HOME: xdgConfigHome
      },
      stdio: "pipe"
    }
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

export async function fetchMonthSummary(request: APIRequestContext, yearMonth: string) {
  const response = await request.get(`${baseUrl}/api/months/${yearMonth}`);
  if (!response.ok()) {
    throw new Error(`Failed to fetch month summary for ${yearMonth}: ${response.status()}`);
  }
  return (await response.json()) as {
    yearMonth: string;
    dailyRows: Array<{ date: string; label: "today" | "planned" }>;
  };
}
