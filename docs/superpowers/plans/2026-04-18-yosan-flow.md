# Yosan Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cloudflare Workers 上で動く SvelteKit + D1 ベースの Yosan Flow を、月予算管理、日次入力、再按分表示、履歴表示まで一通り動作する状態で構築する。

**Architecture:** SvelteKit を `adapter-cloudflare` で Workers に載せ、サーバ側で JST 判定と再按分計算を行う。D1 には月予算、日次集計、操作履歴を保存し、推奨日次予算は保存せず API 応答時に都度計算する。Cloudflare Access はインフラ保護として扱い、アプリ内では単一ユーザー前提の最小構成に保つ。

**Tech Stack:** SvelteKit, TypeScript, adapter-cloudflare, Cloudflare Workers, Cloudflare D1, Vitest, Playwright

---

## File Structure Map

- `package.json`
  - 依存関係、scripts、Node/PNPM 方針を定義する
- `pnpm-lock.yaml`
  - lockfile
- `tsconfig.json`
  - TypeScript 全体設定
- `svelte.config.js`
  - SvelteKit + adapter-cloudflare 設定
- `vite.config.ts`
  - Vitest 含むビルド設定
- `wrangler.jsonc`
  - Workers/D1 binding と local/preview/production の設定
- `.gitignore`
  - Node/SvelteKit/Cloudflare 生成物除外
- `.dev.vars.example`
  - ローカル設定例
- `README.md`
  - セットアップ、開発、デプロイ、Access 前提を説明
- `migrations/0001_initial.sql`
  - D1 初期スキーマ
- `src/app.d.ts`
  - Cloudflare bindings 型
- `src/lib/server/time/jst.ts`
  - JST 日付/年月ユーティリティ
- `src/lib/server/domain/budget.ts`
  - 月予算関連の型と純粋関数
- `src/lib/server/domain/reallocation.ts`
  - 再按分ロジック
- `src/lib/server/domain/daily-entry.ts`
  - 日次入力の型と業務ルール
- `src/lib/server/db/client.ts`
  - D1 呼び出し共通化
- `src/lib/server/db/month-repository.ts`
  - 月予算の取得/初期化/更新
- `src/lib/server/db/daily-total-repository.ts`
  - 日次集計の取得/更新
- `src/lib/server/db/daily-history-repository.ts`
  - 履歴の取得/追加
- `src/lib/server/services/month-summary-service.ts`
  - 月ダッシュボード用レスポンス組み立て
- `src/lib/server/services/day-entry-service.ts`
  - add/overwrite トランザクション処理
- `src/lib/server/validation/month.ts`
  - `yyyy-mm` バリデーション
- `src/lib/server/validation/day.ts`
  - `yyyy-mm-dd` と金額バリデーション
- `src/routes/+page.server.ts`
  - 現在月ダッシュボードの初期ロード
- `src/routes/+page.svelte`
  - 月ダッシュボード UI
- `src/routes/api/months/[yearMonth]/+server.ts`
  - 月表示 API
- `src/routes/api/months/[yearMonth]/budget/+server.ts`
  - 月予算更新 API
- `src/routes/api/months/[yearMonth]/initialize/+server.ts`
  - 月初期化 API
- `src/routes/api/days/[date]/add/+server.ts`
  - 日次追加 API
- `src/routes/api/days/[date]/overwrite/+server.ts`
  - 日次上書き API
- `src/routes/api/days/[date]/history/+server.ts`
  - 日別履歴 API
- `src/lib/components/BudgetSummary.svelte`
  - 集計ヘッダ
- `src/lib/components/DailyBudgetTable.svelte`
  - 今日以降一覧
- `src/lib/components/DayEntryModal.svelte`
  - 日次入力モーダル
- `src/lib/components/HistoryPanel.svelte`
  - 履歴表示
- `tests/unit/reallocation.test.ts`
  - 再按分の純粋関数テスト
- `tests/unit/jst.test.ts`
  - JST 判定テスト
- `tests/unit/month-summary-service.test.ts`
  - 月サマリ組み立てテスト
- `tests/integration/api/months.test.ts`
  - 月 API テスト
- `tests/integration/api/days.test.ts`
  - 日次 API テスト
- `tests/e2e/dashboard.spec.ts`
  - ダッシュボード E2E

### Task 1: Repository Scaffold

**Files:**
- Create: `package.json`
- Create: `pnpm-lock.yaml`
- Create: `tsconfig.json`
- Create: `svelte.config.js`
- Create: `vite.config.ts`
- Create: `wrangler.jsonc`
- Create: `.gitignore`
- Create: `.dev.vars.example`
- Create: `README.md`

- [x] **Step 1: Write the failing bootstrap expectation**

README に最小要件を書き、必要な scripts を列挙する。

```md
- dev
- check
- test:unit
- test:integration
- test:e2e
- build
```

- [x] **Step 2: Create the minimal app/tooling scaffold**

SvelteKit + TypeScript + adapter-cloudflare を導入し、`wrangler.jsonc` に D1 binding 名 `DB` を定義する。

```json
{
  "scripts": {
    "dev": "vite dev",
    "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "test:e2e": "playwright test",
    "build": "vite build"
  }
}
```

- [x] **Step 3: Verify the scaffold compiles**

Run: `pnpm install`
Expected: dependencies install successfully

- [x] **Step 4: Verify static checks**

Run: `pnpm check`
Expected: no type or Svelte config errors

- [x] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json svelte.config.js vite.config.ts wrangler.jsonc .gitignore .dev.vars.example README.md
git commit -m "feat: scaffold SvelteKit Cloudflare app"
```

### Task 2: D1 Schema And Time Utilities

**Files:**
- Create: `migrations/0001_initial.sql`
- Create: `src/app.d.ts`
- Create: `src/lib/server/time/jst.ts`
- Test: `tests/unit/jst.test.ts`

- [x] **Step 1: Write the failing JST tests**

```ts
import { describe, expect, it } from "vitest";
import { getJstDateParts, isFutureDateFromJstToday } from "$lib/server/time/jst";

describe("getJstDateParts", () => {
  it("converts UTC instant to JST year-month-day", () => {
    const parts = getJstDateParts(new Date("2026-04-17T15:30:00.000Z"));
    expect(parts.date).toBe("2026-04-18");
    expect(parts.yearMonth).toBe("2026-04");
  });
});

describe("isFutureDateFromJstToday", () => {
  it("treats tomorrow as future in JST", () => {
    expect(isFutureDateFromJstToday("2026-04-19", "2026-04-18")).toBe(true);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit tests/unit/jst.test.ts`
Expected: FAIL with module not found

- [x] **Step 3: Write minimal time utilities and D1 schema**

```sql
CREATE TABLE monthly_budgets (
  year_month TEXT PRIMARY KEY,
  budget_yen INTEGER NULL,
  budget_status TEXT NOT NULL CHECK (budget_status IN ('unset', 'set')),
  initialized_from_previous_month INTEGER NOT NULL DEFAULT 0,
  carried_from_year_month TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE daily_totals (
  date TEXT PRIMARY KEY,
  year_month TEXT NOT NULL,
  total_used_yen INTEGER NOT NULL CHECK (total_used_yen >= 0),
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_daily_totals_year_month
  ON daily_totals (year_month, date);

CREATE TABLE daily_operation_histories (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  operation_type TEXT NOT NULL CHECK (operation_type IN ('add', 'overwrite')),
  input_yen INTEGER NOT NULL CHECK (input_yen >= 0),
  before_total_yen INTEGER NOT NULL CHECK (before_total_yen >= 0),
  after_total_yen INTEGER NOT NULL CHECK (after_total_yen >= 0),
  memo TEXT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_daily_histories_date_created_at
  ON daily_operation_histories (date, created_at DESC);
```

```ts
export function getJstDateParts(now: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = formatter.format(now);
  return {
    date: parts,
    yearMonth: parts.slice(0, 7)
  };
}
```

- [x] **Step 4: Run unit tests**

Run: `pnpm test:unit`
Expected: JST utility tests pass

- [x] **Step 5: Commit**

```bash
git add migrations/0001_initial.sql src/app.d.ts src/lib/server/time/jst.ts tests/unit/jst.test.ts
git commit -m "feat: add D1 schema and JST utilities"
```

### Task 3: Domain Logic For Reallocation

**Files:**
- Create: `src/lib/server/domain/reallocation.ts`
- Create: `src/lib/server/domain/budget.ts`
- Test: `tests/unit/reallocation.test.ts`

- [x] **Step 1: Write the failing reallocation tests**

```ts
import { describe, expect, it } from "vitest";
import { buildDailyRecommendations } from "$lib/server/domain/reallocation";

it("distributes remainder from today forward", () => {
  expect(buildDailyRecommendations({ remainingYen: 100, dates: ["2026-04-18", "2026-04-19", "2026-04-20"] }))
    .toEqual([
      { date: "2026-04-18", recommendedYen: 34 },
      { date: "2026-04-19", recommendedYen: 33 },
      { date: "2026-04-20", recommendedYen: 33 }
    ]);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit tests/unit/reallocation.test.ts`
Expected: FAIL with missing function

- [x] **Step 3: Implement minimal pure functions**

```ts
export function buildDailyRecommendations(input: { remainingYen: number; dates: string[] }) {
  if (input.remainingYen < 0) {
    return input.dates.map((date) => ({ date, recommendedYen: 0 }));
  }
  const base = Math.floor(input.remainingYen / input.dates.length);
  const remainder = input.remainingYen % input.dates.length;
  return input.dates.map((date, index) => ({
    date,
    recommendedYen: base + (index < remainder ? 1 : 0)
  }));
}
```

- [x] **Step 4: Expand tests**

追加で以下をカバーする。

```ts
- overspent のとき全日 0 円
- 今日を含む日数で割る
- 残り 1 日
- 予定支出込みの remaining 計算
```

- [x] **Step 5: Run unit tests**

Run: `pnpm test:unit`
Expected: reallocation tests pass

- [x] **Step 6: Commit**

```bash
git add src/lib/server/domain/reallocation.ts src/lib/server/domain/budget.ts tests/unit/reallocation.test.ts
git commit -m "feat: add budget reallocation domain logic"
```

### Task 4: Explicit Month Initialization

**Files:**
- Modify: `src/lib/server/db/month-repository.ts`
- Modify: `src/lib/server/services/month-summary-service.ts`
- Create: `tests/integration/api/month-initialize.test.ts`

- [x] **Step 1: Write failing initialize tests**

```ts
it("creates month from previous budget candidate", async () => {
  await seedPreviousMonth({ yearMonth: "2026-03", budgetYen: 120000 });
  const response = await postInitialize("2026-04", { budgetYen: 120000 });
  expect(response.status).toBe(200);
  expect(response.body.initializedFromPreviousMonth).toBe(true);
  expect(response.body.carriedFromYearMonth).toBe("2026-03");
});

it("treats duplicate initialize requests idempotently", async () => {
  await postInitialize("2026-04", { budgetYen: 120000 });
  const response = await postInitialize("2026-04", { budgetYen: 120000 });
  expect(response.status).toBe(200);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test:integration tests/integration/api/month-initialize.test.ts`
Expected: FAIL with missing initialization behavior

- [x] **Step 3: Implement explicit initialization**

要件:

```ts
- GET では月を作成しない
- POST /initialize または PUT /budget 初回更新で月を作成する
- 前月 budget があれば carried_from_year_month を保存
- 重複初期化は既存レコードを返して冪等に扱う
```

- [x] **Step 4: Run integration tests**

Run: `pnpm test:integration tests/integration/api/month-initialize.test.ts`
Expected: initialize behavior passes

- [x] **Step 5: Commit**

```bash
git add src/lib/server/db/month-repository.ts src/lib/server/services/month-summary-service.ts tests/integration/api/month-initialize.test.ts
git commit -m "feat: add explicit month initialization flow"
```

### Task 5: D1 Repositories And Transactional Day Updates

**Files:**
- Create: `src/lib/server/db/client.ts`
- Create: `src/lib/server/db/month-repository.ts`
- Create: `src/lib/server/db/daily-total-repository.ts`
- Create: `src/lib/server/db/daily-history-repository.ts`
- Create: `src/lib/server/domain/daily-entry.ts`
- Create: `src/lib/server/services/day-entry-service.ts`
- Test: `tests/integration/api/days.test.ts`

- [x] **Step 1: Write failing integration tests for add/overwrite**

```ts
it("adds to the day's total and records history", async () => {
  const response = await postAdd("2026-04-18", { inputYen: 1000, memo: "lunch" });
  expect(response.status).toBe(200);
  expect(response.body.dailyTotal.usedYen).toBe(1000);
  expect(response.body.history[0].operationType).toBe("add");
});

it("overwrites the day's total atomically", async () => {
  await postAdd("2026-04-18", { inputYen: 1000 });
  const response = await putOverwrite("2026-04-18", { inputYen: 3000 });
  expect(response.body.dailyTotal.usedYen).toBe(3000);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test:integration tests/integration/api/days.test.ts`
Expected: FAIL with missing repositories/routes

- [x] **Step 3: Implement repository primitives**

最低限、以下の責務を分離する。

```ts
- findMonth(yearMonth)
- createMonth(...)
- upsertDailyTotal(...)
- listHistoriesByDate(date)
- insertHistory(entry)
```

- [x] **Step 4: Implement transaction service**

`day-entry-service.ts` に以下を実装する。

```ts
- requireBudgetSet(yearMonth)
- addDailyAmount(date, inputYen, memo)
- overwriteDailyAmount(date, inputYen, memo)
```

処理要件:

```ts
- daily_totals 更新
- daily_operation_histories insert
- before_total_yen / after_total_yen 一貫性
- 同一トランザクションで実行
```

- [x] **Step 5: Run integration tests**

Run: `pnpm test:integration tests/integration/api/days.test.ts`
Expected: add/overwrite behavior passes

- [x] **Step 6: Commit**

```bash
git add src/lib/server/db src/lib/server/domain/daily-entry.ts src/lib/server/services/day-entry-service.ts tests/integration/api/days.test.ts
git commit -m "feat: add transactional daily entry services"
```

### Task 6: Month Summary Service And Month APIs

**Files:**
- Create: `src/lib/server/services/month-summary-service.ts`
- Create: `src/lib/server/validation/month.ts`
- Create: `src/lib/server/validation/day.ts`
- Create: `src/routes/api/months/[yearMonth]/+server.ts`
- Create: `src/routes/api/months/[yearMonth]/initialize/+server.ts`
- Create: `src/routes/api/months/[yearMonth]/budget/+server.ts`
- Create: `src/routes/api/days/[date]/add/+server.ts`
- Create: `src/routes/api/days/[date]/overwrite/+server.ts`
- Create: `src/routes/api/days/[date]/history/+server.ts`
- Test: `tests/unit/month-summary-service.test.ts`
- Test: `tests/integration/api/months.test.ts`

- [x] **Step 1: Write failing month summary tests**

```ts
it("returns suggestedInitialBudgetYen when month record does not exist", async () => {
  const result = await buildMonthSummary("2026-04");
  expect(result.monthStatus).toBe("uninitialized");
  expect(result.suggestedInitialBudgetYen).toBe(120000);
});
```

- [x] **Step 2: Write failing API tests**

```ts
it("GET month is side-effect free", async () => {
  await getMonth("2026-04");
  expect(await countMonthlyBudgets()).toBe(0);
});

it("POST initialize creates the month explicitly", async () => {
  const response = await postInitialize("2026-04", { budgetYen: 120000 });
  expect(response.status).toBe(200);
});
```

- [x] **Step 3: Implement summary service**

レスポンスに以下を含める。

```ts
- yearMonth
- budgetYen
- monthStatus
- budgetStatus
- initializedFromPreviousMonth
- carriedFromYearMonth
- suggestedInitialBudgetYen
- spentToDateYen
- plannedTotalYen
- remainingYen
- overspentYen
- todayRecommendedYen
- daysRemaining
- dailyRows
```

`dailyRows` の要素形も spec に合わせて固定する。

```ts
type DailyRow = {
  date: string;
  label: "today" | "planned";
  usedYen: number;
  recommendedYen: number;
};
```

- [x] **Step 4: Implement route handlers and validation**

必須制約:

```ts
- yyyy-mm / yyyy-mm-dd の形式検証
- 0 以上整数の金額
- 月外日付拒否
- 予算未設定時は 409
- エラーレスポンス統一
```

- [x] **Step 5: Run tests**

Run: `pnpm test:unit && pnpm test:integration`
Expected: month summary / month APIs / day APIs all pass

- [x] **Step 6: Commit**

```bash
git add src/lib/server/services/month-summary-service.ts src/lib/server/validation src/routes/api tests/unit/month-summary-service.test.ts tests/integration/api/months.test.ts
git commit -m "feat: add month summary and API routes"
```

### Task 7: Dashboard UI

**Files:**
- Create: `src/routes/+page.server.ts`
- Create: `src/routes/+page.svelte`
- Create: `src/lib/components/BudgetSummary.svelte`
- Create: `src/lib/components/DailyBudgetTable.svelte`
- Create: `src/lib/components/DayEntryModal.svelte`
- Create: `src/lib/components/HistoryPanel.svelte`
- Create: `tests/e2e/helpers/db.ts`
- Test: `tests/e2e/dashboard.spec.ts`

- [x] **Step 1: Write failing E2E expectations**

```ts
test("shows budget prompt for uninitialized month", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("月予算を設定してください")).toBeVisible();
});

test("shows future entries as planned spending", async ({ page }) => {
  await seedMonth({
    yearMonth: "2026-04",
    budgetYen: 120000,
    dailyTotals: [{ date: "2026-04-20", totalUsedYen: 3000 }]
  });
  await page.goto("/");
  await expect(page.getByText("予定支出")).toBeVisible();
});
```

- [x] **Step 2: Run E2E to verify it fails**

Run: `pnpm test:e2e tests/e2e/dashboard.spec.ts`
Expected: FAIL because page and components do not exist yet

- [x] **Step 3: Implement page loader and components**

表示要件:

```ts
- 対象年月
- 月予算
- 前月引継ぎ表示
- 今月ここまでの使用額
- 今月の総使用予定額
- 月残額 / 超過額
- 今日の推奨日次予算
- 今日以降一覧
```

- [x] **Step 4: Implement modal interactions**

最低限の操作:

```ts
- 月予算の初回設定
- 月予算の変更
- 日次追加
- 日次上書き
- 保存後リロード
```

- [x] **Step 5: Run checks and E2E**

Run: `pnpm check && pnpm test:e2e`
Expected: dashboard behavior passes

- [x] **Step 5.1: Add repeatable seed/reset helpers**

`tests/e2e/helpers/db.ts` に以下を実装する。

```ts
- resetDatabase()
- seedMonth(...)
- seedHistory(...)
```

E2E の `beforeEach` / `afterEach` で毎回同じ初期状態を作る。

- [x] **Step 6: Commit**

```bash
git add src/routes/+page.server.ts src/routes/+page.svelte src/lib/components tests/e2e/helpers/db.ts tests/e2e/dashboard.spec.ts
git commit -m "feat: build Yosan Flow dashboard UI"
```

### Task 8: Docs And Deploy Readiness

**Files:**
- Modify: `README.md`
- Modify: `wrangler.jsonc`
- Modify: `.dev.vars.example`

- [x] **Step 1: Document local/preview/production flow**

README に以下を書く。

```md
- pnpm install
- pnpm check
- pnpm test:unit
- pnpm test:integration
- pnpm test:e2e
- wrangler d1 migrations apply
- Cloudflare Access protection notes
```

- [x] **Step 2: Validate build and deploy config**

Run: `pnpm build`
Expected: production build succeeds

- [x] **Step 3: Validate test suite**

Run: `pnpm check && pnpm test:unit && pnpm test:integration`
Expected: all green

- [x] **Step 4: Commit**

```bash
git add README.md wrangler.jsonc .dev.vars.example
git commit -m "docs: add setup and deployment guidance"
```

## Final Verification

- [x] Run: `pnpm check`
- [x] Run: `pnpm test:unit`
- [x] Run: `pnpm test:integration`
- [x] Run: `pnpm build`
- [x] If browser tooling is ready, run: `pnpm test:e2e`
- [x] Confirm D1 migration applies locally: `pnpm wrangler d1 migrations apply DB --local`
- [x] Confirm repeatable E2E setup: `pnpm test:e2e tests/e2e/dashboard.spec.ts --repeat-each=2`
- [x] If integration/E2E tests seed D1 locally, reset before rerun with the documented helper or script

## Notes For Execution

- `GET /api/months/:yyyy-mm` は read-only を維持し、月作成は `POST /initialize` または `PUT /budget` でのみ行う
- `budget_status = 'unset'` の月は日次更新禁止
- 予定支出ラベルはレスポンス生成時点の JST 比較で決める
- 再按分は今日を含む残り日数で計算する
- まず純粋関数とテストを固め、その後 D1 / API / UI を積む
