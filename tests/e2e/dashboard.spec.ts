import path from "node:path";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import { resetDatabase, seedMonth } from "./helpers/db";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4173;
const TEST_TIMEOUT_MS = 90_000;
const WORKDIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let devServer: ViteDevServer | null = null;
let baseUrl = `http://${DEFAULT_HOST}:${DEFAULT_PORT}`;

function toYearMonth(year: number, month: number): string {
  const normalizedYear = year + Math.floor((month - 1) / 12);
  const normalizedMonth = ((month - 1) % 12) + 1;
  return `${normalizedYear}-${String(normalizedMonth).padStart(2, "0")}`;
}

function monthOffset(base: string, offset: number): string {
  const [year, month] = base.split("-").map(Number);
  return toYearMonth(year, month + offset);
}

function getCurrentJstYearMonth(): string {
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

async function startDevServer(): Promise<void> {
  if (devServer) {
    return;
  }

  const xdgConfigHome = path.join(WORKDIR, ".tmp-xdg-config");
  await mkdir(path.join(xdgConfigHome, ".wrangler", "logs"), { recursive: true });
  process.env.XDG_CONFIG_HOME = xdgConfigHome;

  devServer = await createServer({
    root: WORKDIR,
    configFile: path.join(WORKDIR, "vite.config.ts"),
    server: {
      host: DEFAULT_HOST,
      port: DEFAULT_PORT
    }
  });
  await devServer.listen();
  const resolved = devServer.resolvedUrls?.local?.[0];
  if (resolved) {
    baseUrl = resolved.replace(/\/$/, "");
  }
  await waitForServerReady(`${baseUrl}/`);
}

async function stopDevServer(): Promise<void> {
  if (!devServer) {
    return;
  }

  const server = devServer;
  devServer = null;
  await server.close();
}

async function fetchMonthSummary(request: APIRequestContext, yearMonth: string) {
  const response = await request.get(`${baseUrl}/api/months/${yearMonth}`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as {
    yearMonth: string;
    dailyRows: Array<{ date: string; label: "today" | "planned" }>;
  };
}

test.describe.configure({ mode: "serial", timeout: 120_000 });
test.beforeAll(async ({}, testInfo) => {
  testInfo.setTimeout(120_000);
  await startDevServer();
});

test.afterAll(async () => {
  await stopDevServer();
});

test("shows budget prompt for uninitialized month", async ({ page }, testInfo) => {
  const yearMonth = monthOffset("2030-01", testInfo.repeatEachIndex * 10 + testInfo.workerIndex + 1);

  await page.goto(`${baseUrl}/?yearMonth=${yearMonth}`);

  await expect(page.getByText("月予算を設定してください")).toBeVisible();
  await expect(page.getByLabel("月予算 (円)")).toBeVisible();
});

test("sets and updates monthly budget", async ({ page }, testInfo) => {
  const yearMonth = monthOffset("2030-03", testInfo.repeatEachIndex * 10 + testInfo.workerIndex + 1);

  await page.goto(`${baseUrl}/?yearMonth=${yearMonth}`);
  await page.getByLabel("月予算 (円)").fill("120000");
  await page.getByRole("button", { name: "予算を保存" }).click();
  await expect(page.getByTestId("budget-value")).toContainText("120000");

  await page.getByLabel("月予算 (円)").fill("150000");
  await page.getByRole("button", { name: "予算を保存" }).click();
  await expect(page.getByTestId("budget-value")).toContainText("150000");
});

test("supports add and overwrite, and keeps values after reload", async ({ page, request }) => {
  const yearMonth = getCurrentJstYearMonth();
  const summary = await fetchMonthSummary(request, yearMonth);
  const todayRow = summary.dailyRows.find((row) => row.label === "today");
  const plannedRow = summary.dailyRows.find((row) => row.label === "planned");
  expect(todayRow).toBeDefined();
  await resetDatabase(request, {
    yearMonth,
    budgetYen: 0,
    dates: todayRow ? [todayRow.date] : []
  });
  await seedMonth(request, {
    yearMonth,
    budgetYen: 120000,
    dailyTotals: plannedRow ? [{ date: plannedRow.date, totalUsedYen: 3000 }] : []
  });

  await page.goto(`${baseUrl}/?yearMonth=${yearMonth}`);
  await expect(page.getByText("予定支出")).toBeVisible();

  await page.getByTestId(`edit-${todayRow?.date}`).click();
  await page.getByLabel("入力額 (円)").fill("2000");
  await page.getByLabel("追加").check();
  await page.getByRole("button", { name: "保存する" }).click();
  await expect(page.getByTestId(`used-${todayRow?.date}`)).toHaveText("2000 円");

  await page.getByTestId(`edit-${todayRow?.date}`).click();
  await page.getByLabel("入力額 (円)").fill("500");
  await page.getByLabel("上書き").check();
  await page.getByRole("button", { name: "保存する" }).click();
  await expect(page.getByTestId(`used-${todayRow?.date}`)).toHaveText("500 円");

  await page.reload();
  await expect(page.getByTestId(`used-${todayRow?.date}`)).toHaveText("500 円");
});

test("shows save error and keeps input when budget is unset", async ({ page, request }, testInfo) => {
  const yearMonth = monthOffset("2030-07", testInfo.repeatEachIndex * 10 + testInfo.workerIndex + 1);
  const summary = await fetchMonthSummary(request, yearMonth);
  const firstRow = summary.dailyRows[0];
  expect(firstRow).toBeDefined();

  await page.goto(`${baseUrl}/?yearMonth=${yearMonth}`);
  await page.getByTestId(`edit-${firstRow?.date}`).click();
  await page.getByLabel("入力額 (円)").fill("1000");
  await page.getByRole("button", { name: "保存する" }).click();

  await expect(page.getByText("月予算を設定してください。")).toBeVisible();
  await expect(page.getByLabel("入力額 (円)")).toHaveValue("1000");
});
