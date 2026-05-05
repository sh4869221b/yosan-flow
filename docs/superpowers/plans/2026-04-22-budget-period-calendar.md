# Budget Period Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 月次予算モデルを任意期間モデルへ置き換え、Bits UI ベースのカレンダー画面と当日割当ベースの再按分を導入する。

**Architecture:** D1 では `budget_periods` を主軸にし、`daily_totals` / `daily_operation_histories` を期間紐付けへ拡張する。SvelteKit server routes は `periods` API を新設し、UI は `Bits UI` を使った期間入力とカレンダー表示へ移行する。推奨額や差分は保存せず、基準日ごとの派生値としてサーバで都度計算する。

**Migration note:** ユーザー指示により後方互換は不要。旧 `months/*` / `days/*` live endpoint は残さず、period API を唯一の主経路にする。

**Tech Stack:** SvelteKit, TypeScript, Cloudflare Workers, Cloudflare D1, Bits UI, @internationalized/date, Vitest, Playwright

---

## File Structure Map

- `package.json`
  - `Bits UI` と日付ユーティリティ依存を追加する
- `migrations/*.sql`
  - `budget_periods` の追加と既存テーブル拡張を管理する
- `src/lib/server/domain/reallocation.ts`
  - 当日割当基準の再按分ロジックを持つ
- `src/lib/server/domain/daily-entry.ts`
  - 期間内日付制約と入力バリデーションを持つ
- `src/lib/server/domain/budget-period.ts`
  - 期間日数、隣接期間、日付所属判定などの純粋関数を持つ
- `src/lib/server/db/budget-period-repository.ts`
  - 期間の作成・取得・更新を持つ
- `src/lib/server/db/daily-total-repository.ts`
  - `budget_period_id` 対応へ更新する
- `src/lib/server/db/daily-history-repository.ts`
  - `budget_period_id` 対応へ更新する
- `src/lib/server/services/month-summary-service.ts`
  - 期間サマリサービスへ責務変更または分割する
- `src/lib/server/services/day-entry-service.ts`
  - add / overwrite を期間単位で扱う
- `src/routes/+page.server.ts`
  - 既定表示対象を期間ベースでロードする
- `src/routes/+page.svelte`
  - ヘッダ + カレンダー + 日詳細モーダル構成へ更新する
- `src/lib/components/BudgetSummary.svelte`
  - 期間ヘッダ向け UI に変更する
- `src/lib/components/DailyBudgetTable.svelte`
  - 置換または縮退候補
- `src/lib/components/DayEntryModal.svelte`
  - 日詳細モーダルとして期間文脈を受け取る
- `src/lib/components/HistoryPanel.svelte`
  - モーダル内履歴表示へ統合または簡素化する
- `src/lib/components/PeriodRangePicker.svelte`
  - `Bits UI` を用いた開始日・終了日入力を新規作成する
- `src/lib/components/PeriodCalendar.svelte`
  - カレンダー表示を新規作成する
- `src/routes/api/periods/...`
  - 新規 API 群
- `tests/unit/*`
  - 期間モデル・再按分ロジック・日付所属の純粋関数テスト
- `tests/integration/*`
  - 期間 API / 日次 API の統合テスト
- `tests/e2e/*`
  - カレンダー UI とモーダル導線の E2E

### Task 1: Add budget period schema and repositories

**Files:**

- Create: `migrations/0002_budget_periods.sql`
- Create: `src/lib/server/domain/budget-period.ts`
- Create: `src/lib/server/db/budget-period-repository.ts`
- Modify: `src/lib/server/db/daily-total-repository.ts`
- Modify: `src/lib/server/db/daily-history-repository.ts`
- Test: `tests/unit/budget-period.test.ts`

- [ ] **Step 1: Write the failing unit tests**

```ts
it("treats the next period start as the day after previous end", () => {
  expect(getNextPeriodStartDate("2026-05-19")).toBe("2026-05-20");
});

it("rejects dates outside the period", () => {
  expect(isDateWithinPeriod("2026-04-19", "2026-04-20", "2026-05-19")).toBe(
    false,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit tests/unit/budget-period.test.ts`
Expected: FAIL with missing module or missing function

- [ ] **Step 3: Add the schema and repository layer**

```sql
CREATE TABLE budget_periods (
  id TEXT PRIMARY KEY,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  budget_yen INTEGER NOT NULL CHECK (budget_yen >= 0),
  predecessor_period_id TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

- [ ] **Step 4: Run unit tests**

Run: `pnpm test:unit`
Expected: new budget period tests pass

- [ ] **Step 5: Commit**

```bash
git add migrations/0002_budget_periods.sql src/lib/server/domain/budget-period.ts src/lib/server/db/budget-period-repository.ts src/lib/server/db/daily-total-repository.ts src/lib/server/db/daily-history-repository.ts tests/unit/budget-period.test.ts
git commit -m "feat: add budget period schema"
```

### Task 2: Replace month summary logic with period summary logic

**Files:**

- Modify: `src/lib/server/services/month-summary-service.ts`
- Modify: `src/lib/server/domain/reallocation.ts`
- Modify: `src/lib/server/domain/daily-entry.ts`
- Test: `tests/unit/reallocation.test.ts`
- Test: `tests/unit/month-summary-service.test.ts`

- [ ] **Step 1: Write the failing tests for daily recommendation behavior**

```ts
it("reallocates based on confirmed usage before today", () => {
  expect(buildDailyRecommendationsForPeriod(/* ... */)).toMatchObject({
    todayRecommendedYen: 3000,
  });
});

it("shows variance against today's allocation", () => {
  expect(result.dailyRows[0].varianceFromRecommendationYen).toBe(500);
});
```

- [ ] **Step 2: Run the focused tests**

Run: `pnpm test:unit tests/unit/reallocation.test.ts tests/unit/month-summary-service.test.ts`
Expected: FAIL because period-based calculation is not implemented

- [ ] **Step 3: Implement period-based summary building**

```ts
const remainingAtToday = budgetYen - spentBeforeTodayYen;
const recommendations = buildDailyRecommendations({
  remainingYen: remainingAtToday,
  dates: remainingDates,
});
```

- [ ] **Step 4: Re-run unit tests**

Run: `pnpm test:unit`
Expected: recommendation and summary tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/services/month-summary-service.ts src/lib/server/domain/reallocation.ts src/lib/server/domain/daily-entry.ts tests/unit/reallocation.test.ts tests/unit/month-summary-service.test.ts
git commit -m "feat: add period-based reallocation"
```

### Task 3: Add periods API routes

**Files:**

- Create: `src/routes/api/periods/+server.ts`
- Create: `src/routes/api/periods/[periodId]/+server.ts`
- Create: `src/routes/api/periods/[periodId]/days/[date]/add/+server.ts`
- Create: `src/routes/api/periods/[periodId]/days/[date]/overwrite/+server.ts`
- Create: `src/routes/api/periods/[periodId]/days/[date]/history/+server.ts`
- Modify: `src/lib/server/validation/day.ts`
- Modify: `src/lib/server/validation/month.ts`
- Test: `tests/integration/api/periods.test.ts`
- Test: `tests/integration/api/days.test.ts`

- [ ] **Step 1: Write failing integration tests**

```ts
it("creates a new period with explicit start and end dates", async () => {
  // expect 201/200 and returned period summary
});

it("rejects add when the date is outside the target period", async () => {
  // expect 400
});
```

- [ ] **Step 2: Run integration tests**

Run: `pnpm test:integration`
Expected: FAIL with missing routes or period validation failures

- [ ] **Step 3: Implement routes and validation**

```ts
assertDateWithinPeriod(date, period.startDate, period.endDate);
```

- [ ] **Step 4: Re-run integration tests**

Run: `pnpm test:integration`
Expected: period API tests pass

- [ ] **Step 5: Commit**

```bash
git add src/routes/api/periods src/lib/server/validation/day.ts src/lib/server/validation/month.ts tests/integration/api/periods.test.ts tests/integration/api/days.test.ts
git commit -m "feat: add budget period api"
```

### Task 4: Add Bits UI based period inputs and calendar

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `src/lib/components/PeriodRangePicker.svelte`
- Create: `src/lib/components/PeriodCalendar.svelte`
- Modify: `src/lib/components/BudgetSummary.svelte`
- Modify: `src/routes/+page.svelte`

- [ ] **Step 1: Add the failing component expectations via E2E or component-facing assertions**

```ts
await expect(page.getByLabel("開始日")).toBeVisible();
await expect(page.getByLabel("終了日")).toBeVisible();
await expect(page.getByRole("grid")).toBeVisible();
```

- [ ] **Step 2: Add Bits UI dependencies**

Run: `pnpm add -D bits-ui @internationalized/date`
Expected: lockfile updates successfully

- [ ] **Step 3: Build the new components**

```svelte
<PeriodRangePicker />
<PeriodCalendar />
```

- [ ] **Step 4: Run type checks**

Run: `pnpm check`
Expected: no Svelte or TypeScript errors

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/components/PeriodRangePicker.svelte src/lib/components/PeriodCalendar.svelte src/lib/components/BudgetSummary.svelte src/routes/+page.svelte
git commit -m "feat: add period calendar ui"
```

### Task 5: Convert the day detail flow into a calendar-driven modal

**Files:**

- Modify: `src/lib/components/DayEntryModal.svelte`
- Modify: `src/lib/components/HistoryPanel.svelte`
- Modify: `src/routes/+page.svelte`
- Test: `tests/e2e/dashboard-day-entry.spec.ts`

- [ ] **Step 1: Write the failing E2E scenario**

```ts
await page.getByTestId("calendar-day-2026-04-20").click();
await expect(page.getByText("履歴表示")).toBeVisible();
await expect(page.getByLabel("入力額 (円)")).toBeVisible();
```

- [ ] **Step 2: Run the targeted E2E test**

Run: `pnpm test:e2e tests/e2e/dashboard-day-entry.spec.ts`
Expected: FAIL because calendar-driven modal flow is not wired

- [ ] **Step 3: Refactor modal and history UI**

```svelte
<DayEntryModal {histories} {selectedDate} />
```

- [ ] **Step 4: Re-run E2E**

Run: `pnpm test:e2e tests/e2e/dashboard-day-entry.spec.ts`
Expected: modal flow passes

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/DayEntryModal.svelte src/lib/components/HistoryPanel.svelte src/routes/+page.svelte tests/e2e/dashboard-day-entry.spec.ts
git commit -m "feat: show day history from calendar"
```

### Task 6: Add coverage for end-date updates and next-period continuity

**Files:**

- Test: `tests/unit/budget-period.test.ts`
- Test: `tests/integration/api/periods.test.ts`
- Test: `tests/e2e/dashboard.spec.ts`
- Modify: `src/routes/api/periods/[periodId]/+server.ts`
- Modify: `src/lib/server/db/budget-period-repository.ts`

- [ ] **Step 1: Add failing tests for end date updates**

```ts
it("prevents overlap when extending a period into the next one", async () => {
  // expect 409
});

it("shows next period start date as the day after the current end date", async () => {
  // expect UI text
});
```

- [ ] **Step 2: Run tests**

Run: `pnpm test:unit tests/unit/budget-period.test.ts && pnpm test:integration tests/integration/api/periods.test.ts`
Expected: FAIL on update conflict handling

- [ ] **Step 3: Implement update constraints**

```ts
if (nextPeriod && updatedEndDate >= nextPeriod.startDate)
  throw new Error("PERIOD_OVERLAP");
```

- [ ] **Step 4: Re-run checks**

Run: `pnpm test:unit && pnpm test:integration`
Expected: continuity and overlap tests pass

- [ ] **Step 5: Commit**

```bash
git add src/routes/api/periods/[periodId]/+server.ts src/lib/server/db/budget-period-repository.ts tests/unit/budget-period.test.ts tests/integration/api/periods.test.ts tests/e2e/dashboard.spec.ts
git commit -m "feat: enforce period continuity"
```

### Task 7: Remove or deprecate old month-centric UI paths and update docs

**Files:**

- Modify: `README.md`
- Modify: `src/routes/+page.server.ts`
- Modify: `src/routes/api/months/[yearMonth]/+server.ts`
- Modify: `src/lib/components/DailyBudgetTable.svelte`
- Modify: `docs/superpowers/specs/2026-04-22-budget-period-calendar-design.md`

- [ ] **Step 1: Document the desired final state**

```md
- Budget is managed by date range, not by month
- Calendar is the primary interaction surface
```

- [ ] **Step 2: Make the old routes compatibility-only or remove their UI references**

Run: `pnpm check`
Expected: no unused imports or broken page loads

- [ ] **Step 3: Update README**

```md
予算は開始日・終了日を持つ期間単位で管理します。
```

- [ ] **Step 4: Run the full verification set**

Run: `pnpm check`
Expected: PASS

Run: `pnpm test:unit`
Expected: PASS

Run: `pnpm test:integration`
Expected: PASS

Run: `pnpm test:e2e`
Expected: PASS

Run: `pnpm build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add README.md src/routes/+page.server.ts src/routes/api/months/[yearMonth]/+server.ts src/lib/components/DailyBudgetTable.svelte docs/superpowers/specs/2026-04-22-budget-period-calendar-design.md
git commit -m "docs: finalize period calendar migration"
```
