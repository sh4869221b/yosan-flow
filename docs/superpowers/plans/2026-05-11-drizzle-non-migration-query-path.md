# Non-Migration Drizzle Query Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep SQL migrations as the source of truth while removing raw D1 query construction from non-migration application paths.

**Architecture:** Drizzle remains the typed schema mirror and query-construction layer. Runtime SQL migrations and schema bootstrap stay out of scope; application reads, writes, reset helpers, and atomic day-entry persistence should flow through `createDrizzleD1Database` and Drizzle D1 query/batch APIs. The service layer should depend on repository operations instead of direct `db.prepare(...)`.

**Tech Stack:** SvelteKit, TypeScript, Cloudflare D1, Drizzle ORM D1 driver, Effect, Vitest, Playwright

---

## Execution Summary

Completed on 2026-05-11.

- Removed non-migration raw D1 period lookup, day-entry atomic writes, and E2E reset deletes from application query paths.
- Removed the old `prepareUpsertDailyTotal` / `prepareInsertHistory` production APIs instead of keeping compatibility wrappers.
- Added a source guard so raw D1 query construction only remains in the isolated runtime schema bootstrap and D1 type/test boundaries.
- Kept `migrations/*.sql` as the schema source of truth and did not adopt Drizzle-generated migrations.

## Scope

In scope:

- Replace non-migration raw `db.prepare(...)` reads in application services with Drizzle-backed repository calls.
- Replace non-migration raw D1 batch execution for day-entry writes with Drizzle D1 batch.
- Replace the E2E reset endpoint's raw delete statements with Drizzle deletes.
- Update D1 fake/test support only where the changed query shape requires it.
- Preserve user-facing API behavior, period-first domain rules, and same-day spending semantics.
- Remove old raw-D1 application query interfaces instead of keeping compatibility aliases or fallback paths.

Out of scope:

- Do not change `migrations/*.sql`.
- Do not adopt Drizzle-generated migrations or drift checks.
- Do not change deploy scripts or D1 binding names.
- Do not change public API routes or response shapes.
- Treat `ensureD1Schema` / `d1SchemaStatements` as schema bootstrap, not application query logic. It may remain raw SQL unless a separate migration/bootstrap plan replaces it.

## No-Compatibility Policy

- Do not keep compatibility shims for the old non-migration raw D1 query path.
- Do not keep deprecated `prepare*` methods that return `D1PreparedStatement`.
- Do not add dual paths such as "use Drizzle, fall back to raw D1".
- If Drizzle D1 batch cannot preserve the daily-entry atomicity contract, stop the implementation and revise this plan instead of leaving raw D1 as an exception.
- Schema bootstrap is the only allowed raw SQL area in this plan, and it must stay clearly isolated from application query code.

## Current Raw D1 Targets

- `src/routes/api/__test/reset/+server.ts`
  - Raw `db.batch([db.prepare("DELETE ..."), ...])`.
- `src/lib/server/services/month-summary-service.ts`
  - `ensureD1Schema` uses raw `CREATE TABLE IF NOT EXISTS` and `db.batch`.
  - `createD1DayEntryService` reads period data with raw `db.prepare(...).first()`.
  - `createD1DayEntryService` writes daily total + history with raw `db.batch([totalMutation, historyInsert])`.
- `src/lib/server/db/daily-total-repository.ts`
  - `prepareUpsertDailyTotal` converts a Drizzle query to SQL and wraps it in `input.db.prepare(...)`.
- `src/lib/server/db/daily-history-repository.ts`
  - `prepareInsertHistory` converts a Drizzle query to SQL and wraps it in `input.db.prepare(...)`.
- `tests/integration/helpers/period-d1-fake.ts`
  - Simulates the raw D1 `prepare/batch` path and may need to simulate Drizzle D1 `batch` behavior.

## File Structure Map

- Modify: `src/lib/server/db/client.ts`
  - Keep `createDrizzleD1Database` as the single D1-to-Drizzle boundary.
  - Add shared type aliases only if needed for Drizzle D1 batch items.
- Modify: `src/lib/server/db/budget-period-repository.ts`
  - Reuse existing Drizzle `findById` for day-entry period lookup.
  - Add a focused method only if the service needs a narrower period-range validation result.
- Modify: `src/lib/server/db/daily-total-repository.ts`
  - Replace D1 prepared statement return values with Drizzle query objects suitable for `database.batch(...)`, or expose a repository-level atomic helper.
  - Remove the old `prepareUpsertDailyTotal` API instead of keeping it as a compatibility wrapper.
- Modify: `src/lib/server/db/daily-history-repository.ts`
  - Same as daily total: stop returning raw D1 prepared statements for non-migration writes.
  - Remove the old `prepareInsertHistory` API instead of keeping it as a compatibility wrapper.
- Modify: `src/lib/server/services/month-summary-service.ts`
  - Remove direct raw period lookup from `createD1DayEntryService`.
  - Replace raw D1 application batch with a Drizzle-backed atomic helper.
  - Leave `ensureD1Schema` unchanged unless tests prove it is tightly coupled to app-query refactoring.
- Modify: `src/routes/api/__test/reset/+server.ts`
  - Use Drizzle deletes in dependency order.
- Modify: `tests/integration/helpers/period-d1-fake.ts`
  - Adjust fake behavior to match Drizzle D1 batch/query behavior.
- Modify/Test: `tests/integration/api/months.test.ts`
  - Keep the duplicate history ID rollback regression as the main atomicity guard.
- Modify/Test: `tests/unit/db-boundary.test.ts`
  - Add a focused test proving Drizzle D1 batch/deletes use the existing binding without raw query construction in app code.
- Optional docs: `README.md`, `CONTRIBUTING.md`
  - Only update if implementation changes documented Drizzle scope. Do not document internal refactors just for churn.

---

### Task 1: Lock Scope With Tests

**Files:**

- Modify: `tests/unit/db-boundary.test.ts`
- Inspect: `src/lib/server/services/month-summary-service.ts`
- Inspect: `src/lib/server/db/daily-total-repository.ts`
- Inspect: `src/lib/server/db/daily-history-repository.ts`

- [ ] **Step 1: Confirm the local Drizzle D1 API supports batch**

Run:

```bash
rg -n "batch<U" node_modules/drizzle-orm/d1 node_modules/drizzle-orm -g '*.d.ts'
```

Expected: `node_modules/drizzle-orm/d1/driver.d.ts` exposes `DrizzleD1Database.batch(...)`.

- [ ] **Step 2: Add a boundary test for Drizzle batch**

Add a test near the existing Drizzle boundary test that creates two Drizzle insert/delete queries and passes them to `database.batch(...)`.

The test should assert:

- D1 binding `batch` is called once.
- Each batch item reaches the fake D1 statement execution path.
- The application code does not need to manually call `db.prepare(...)` for this path.

- [ ] **Step 3: Run the focused test**

Run:

```bash
pnpm test:unit -- tests/unit/db-boundary.test.ts
```

Expected: new test initially fails if the fake does not support Drizzle batch shape; existing tests still pass.

- [ ] **Step 4: Update only test fake support needed for the boundary**

If the unit D1 stub is missing methods used by Drizzle batch, extend the stub minimally in `tests/unit/db-boundary.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/db-boundary.test.ts
git commit -m "test: cover drizzle d1 batch boundary"
```

---

### Task 2: Move Day-Entry Period Lookup Behind Repository

**Files:**

- Modify: `src/lib/server/services/month-summary-service.ts`
- Test: `tests/integration/api/months.test.ts`
- Test: `tests/integration/api/periods.test.ts`

- [ ] **Step 1: Write or identify focused behavior coverage**

Use existing tests for:

- missing period returns the current period-not-found error.
- date outside period still fails.
- valid day entry still updates total and history.

Run:

```bash
pnpm test:integration -- tests/integration/api/months.test.ts tests/integration/api/periods.test.ts
```

Expected: pass before refactor.

- [ ] **Step 2: Refactor `createD1DayEntryService` input**

Change `createD1DayEntryService` to receive `budgetPeriodRepository: BudgetPeriodRepository`.

Target shape:

```ts
function createD1DayEntryService(
  dailyTotalRepository: D1DailyTotalRepository,
  dailyHistoryRepository: D1DailyHistoryRepository,
  budgetPeriodRepository: BudgetPeriodRepository,
  now: () => Date,
  createHistoryId: () => string,
): DayEntryServicePort;
```

- [ ] **Step 3: Replace raw period lookup**

Replace the direct `db.prepare(...).first()` block with:

```text
const period = yield* budgetPeriodRepository.findById(command.periodId);
```

Then use `period.startDate` and `period.endDate` for `isDateWithinPeriod(...)`.

- [ ] **Step 4: Update call site**

In `createD1ApiServices`, pass `budgetPeriodRepository` into `createD1DayEntryService`.

- [ ] **Step 5: Run focused integration tests**

Run:

```bash
pnpm test:integration -- tests/integration/api/months.test.ts tests/integration/api/periods.test.ts
```

Expected: pass with no API response changes.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/services/month-summary-service.ts tests/integration/api/months.test.ts tests/integration/api/periods.test.ts
git commit -m "refactor: use drizzle repository for day entry period lookup"
```

---

### Task 3: Replace Prepared D1 Statement Builders With Drizzle Batch Items

**Files:**

- Modify: `src/lib/server/db/daily-total-repository.ts`
- Modify: `src/lib/server/db/daily-history-repository.ts`
- Modify: `src/lib/server/services/month-summary-service.ts`
- Modify: `tests/integration/helpers/period-d1-fake.ts`
- Test: `tests/integration/api/months.test.ts`

- [ ] **Step 1: Keep the atomicity regression as the failing safety net**

Run:

```bash
pnpm test:integration -- tests/integration/api/months.test.ts -t "rolls back daily total when batch history insert fails with duplicate id"
```

Expected: pass before refactor.

- [ ] **Step 2: Change repository return types away from `D1PreparedStatement`**

Remove these methods from the public repository interfaces and implementations:

```ts
prepareUpsertDailyTotal(...): D1PreparedStatement;
prepareInsertHistory(...): D1PreparedStatement;
```

Do not keep deprecated aliases or wrappers for them.

Replace them with Drizzle query-returning methods. Prefer names that describe Drizzle batch usage:

```ts
buildUpsertDailyTotalQuery(...): ReturnType<typeof database.insert>;
buildInsertHistoryQuery(...): ReturnType<typeof database.insert>;
```

If exact TypeScript return types are too complex, keep these builders private and expose a repository method that performs the atomic pair at a higher level instead. The higher-level method must still execute through Drizzle and must not call raw `input.db.prepare(...)`.

- [ ] **Step 3: Prefer a single repository-level atomic helper if types get noisy**

If Drizzle D1 batch item typing becomes brittle, create a focused helper in a DB module:

```ts
export function createD1DayEntryWriter(input: {
  db: D1Database;
  ensureSchema?: () => Promise<void>;
}) {
  const database = createDrizzleD1Database(input.db);
  return {
    writeDailyEntryBatch(totalInput, historyInput, mode) {
      return database.batch([
        database.insert(daily_totals).values(...).onConflictDoUpdate(...),
        database.insert(daily_operation_histories).values(...),
      ]);
    },
  };
}
```

Keep the helper close to existing repository code and avoid introducing a broad unit-of-work abstraction.

Do not use this helper to hide raw D1 prepared statements. If the helper cannot use Drizzle D1 `batch(...)` without unsafe casts or raw prepare calls, stop and revise the design.

- [ ] **Step 4: Replace raw `db.batch` in `createD1DayEntryService`**

Replace:

```ts
db.batch([totalMutation, historyInsert]);
```

with a Drizzle-backed `database.batch(...)` call or the helper from Step 3. Remove the old raw D1 mutation path in the same change.

- [ ] **Step 5: Preserve rollback behavior**

Update `tests/integration/helpers/period-d1-fake.ts` only as needed so the duplicate history ID test still verifies:

- second history insert fails.
- daily total from the failed batch is rolled back.
- only the first history row remains.

- [ ] **Step 6: Run focused integration tests**

Run:

```bash
pnpm test:integration -- tests/integration/api/months.test.ts
```

Expected: pass, including the duplicate history rollback test.

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/db/daily-total-repository.ts src/lib/server/db/daily-history-repository.ts src/lib/server/services/month-summary-service.ts tests/integration/helpers/period-d1-fake.ts tests/integration/api/months.test.ts
git commit -m "refactor: use drizzle batch for day entry writes"
```

---

### Task 4: Convert E2E Reset Endpoint To Drizzle Deletes

**Files:**

- Modify: `src/routes/api/__test/reset/+server.ts`
- Test: `tests/e2e/dashboard.spec.ts`
- Test: `tests/e2e/dashboard-day-entry.spec.ts`

- [ ] **Step 1: Add Drizzle imports**

Use existing schema and boundary:

```ts
import { createDrizzleD1Database } from "$lib/server/db/client";
import {
  budget_periods,
  daily_operation_histories,
  daily_totals,
} from "$lib/server/db/schema";
```

- [ ] **Step 2: Replace raw deletes**

Replace raw D1 reset batch with Drizzle deletes in foreign-key-safe order:

```ts
const database = createDrizzleD1Database(db);
await database.delete(daily_operation_histories).run();
await database.delete(daily_totals).run();
await database.delete(budget_periods).run();
```

Use sequential deletes unless Drizzle D1 batch typing is already clean from Task 3 and the endpoint benefits from the same helper. This is test-only reset code, so clarity matters more than batching.

- [ ] **Step 3: Run focused checks**

Run:

```bash
pnpm check
pnpm test:e2e -- tests/e2e/dashboard.spec.ts tests/e2e/dashboard-day-entry.spec.ts
```

Expected: typecheck passes and reset-protected E2E flows still reset state between tests.

- [ ] **Step 4: Commit**

```bash
git add src/routes/api/__test/reset/+server.ts
git commit -m "refactor: use drizzle deletes in e2e reset"
```

---

### Task 5: Add A Guard Against New Non-Migration Raw D1 Queries

**Files:**

- Modify: `tests/unit/db-boundary.test.ts` or create `tests/unit/non-migration-drizzle-guard.test.ts`
- Optional Modify: `package.json` only if adding a new script is clearly useful

- [ ] **Step 1: Add a lightweight source guard test**

Create a test that scans `src/` for raw D1 query construction outside allowed files.

Allowed raw SQL locations:

- `src/lib/server/services/month-summary-service.ts` only for `d1SchemaStatements` / `ensureD1Schema`.
- `migrations/*.sql` are outside this test's `src/` scan.

Fail on new app-query uses of:

- `db.prepare(`
- `.prepare(`
- `db.batch(`

Keep the test narrow enough that Drizzle internals and test fakes are not scanned.

Also assert the removed compatibility APIs do not reappear in production source:

- `prepareUpsertDailyTotal`
- `prepareInsertHistory`
- `D1PreparedStatement` imports outside D1 type definitions and test fakes

- [ ] **Step 2: Run the guard**

Run:

```bash
pnpm test:unit -- tests/unit/non-migration-drizzle-guard.test.ts
```

Expected: pass after Tasks 2-4. If `ensureD1Schema` still matches, whitelist that exact block or file with an explanatory comment in the test.

- [ ] **Step 3: Run all unit tests**

Run:

```bash
pnpm test:unit
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add tests/unit/non-migration-drizzle-guard.test.ts package.json
git commit -m "test: guard non-migration d1 queries behind drizzle"
```

---

### Task 6: Final Verification And Documentation Check

**Files:**

- Inspect: `README.md`
- Inspect: `CONTRIBUTING.md`
- Inspect: `docs/superpowers/plans/2026-05-01-quality-tooling-effect-drizzle.md`

- [ ] **Step 1: Run raw D1 scan**

Run:

```bash
rg -n "db\\.prepare|\\.prepare\\(|db\\.batch\\(" src tests/unit tests/integration
```

Expected:

- `src/` only contains allowed schema-bootstrap raw SQL, if any.
- test fakes/stubs may contain raw D1 simulation.
- no application query path uses raw D1 prepare/batch.

- [ ] **Step 2: Run CI-equivalent checks**

Run:

```bash
pnpm format:check
pnpm lint
pnpm check
pnpm test:unit
pnpm test:integration
pnpm build
```

Expected: all pass.

- [ ] **Step 3: Run E2E because reset endpoint changed**

Run:

```bash
pnpm test:e2e
```

Expected: pass.

- [ ] **Step 4: Decide whether docs need updates**

Only update docs if the final state changes the documented Drizzle scope. The expected doc statement remains:

- SQL migrations are source of truth.
- `src/lib/server/db/schema.ts` is the Drizzle schema mirror.
- Drizzle-generated migrations are not adopted.
- Non-migration application query paths use Drizzle.

- [ ] **Step 5: Commit docs only if needed**

```bash
git add README.md CONTRIBUTING.md docs/superpowers/plans/2026-05-11-drizzle-non-migration-query-path.md
git commit -m "docs: plan non-migration drizzle query path"
```

---

## Risks And Stop Conditions

- Stop if local `drizzle-orm` D1 batch typing cannot represent the atomic daily total + history pair without unsafe casts. Do not keep raw D1 batch as a compatibility exception; revise the design before continuing.
- Stop if replacing `db.batch` changes the duplicate-history rollback semantics. The second daily-entry write must fail without persisting the updated daily total, and the old raw D1 path must not remain as a fallback.
- Stop if Drizzle delete behavior in the reset endpoint interacts poorly with D1 foreign-key enforcement. Preserve delete order and verify with E2E.
- Do not remove `ensureD1Schema` in this plan. Removing runtime schema bootstrap is a separate migration/runtime policy decision.

## Success Criteria

- Non-migration application reads/writes no longer build SQL with raw `db.prepare(...)`.
- Day-entry period lookup uses the existing Drizzle-backed budget period repository.
- Day-entry atomic writes use Drizzle D1 batch with no raw D1 fallback.
- E2E reset uses Drizzle deletes.
- Old non-migration raw D1 compatibility APIs are removed, including `prepareUpsertDailyTotal` and `prepareInsertHistory`.
- `migrations/*.sql` remain unchanged.
- Required checks pass:

```bash
pnpm format:check
pnpm lint
pnpm check
pnpm test:unit
pnpm test:integration
pnpm build
pnpm test:e2e
```
