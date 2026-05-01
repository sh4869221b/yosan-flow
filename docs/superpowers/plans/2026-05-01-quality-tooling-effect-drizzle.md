# Quality Tooling, Effect, And Drizzle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Each implementation task should be handled by a fresh subagent, then reviewed by separate spec-compliance and code-quality subagents before moving on. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drizzle, Effect, formatter, linter, and CI を段階導入し、既存の period-first D1/SvelteKit アプリを壊さずに開発品質と DB 境界を整える。

**Architecture:** まず既存の `pnpm check` / tests / build を CI で固定し、その後 formatter と linter を独立導入する。Effect は server-side のエラー表現と service/repository 境界に薄く入れ、Drizzle は既存 SQL migration と一致する schema mirror から始める。DB アクセス置換は repository 単位で小さく進める。

**Tech Stack:** SvelteKit, Svelte 5, TypeScript, Cloudflare Workers, Cloudflare D1, Vitest, Playwright, GitHub Actions, Prettier, ESLint, Effect, Drizzle ORM

---

## Subagent Execution Model

- Main agent owns orchestration, task sequencing, final integration, and merge readiness.
- Each task below should be implemented by a fresh implementation subagent with only that task's context.
- After each implementation subagent reports `DONE`, run two reviews before proceeding:
  - Spec-compliance review: confirms the task matches this plan and adds nothing outside scope.
  - Code-quality review: checks maintainability, regressions, hidden behavior changes, and test coverage.
- If either review reports findings, send the same implementation subagent a bounded fix request, then re-run the relevant review.
- Do not run multiple implementation subagents against overlapping files at the same time. Parallelize only independent review or verification work.
- Subagents must not revert unrelated user changes. The main agent resolves cross-task conflicts.

## File Structure Map

- `.github/workflows/ci.yml`
  - PR / push で品質チェック、テスト、ビルドを実行する。
- `package.json`
  - `format`, `format:check`, `lint`, 必要なら `ci` 系 scripts と依存関係を追加する。
- `pnpm-lock.yaml`
  - formatter / linter / Effect / Drizzle の lockfile 更新を保持する。
- `.prettierrc` / `.prettierignore`
  - Prettier と Svelte 向けの整形対象を定義する。
- `eslint.config.js`
  - ESLint flat config と Svelte / TypeScript 向けルールを定義する。
- `drizzle.config.ts`
  - D1 向け Drizzle 設定を定義する。
- `src/lib/server/db/schema.ts`
  - 既存 `migrations/*.sql` と対応する Drizzle schema を定義する。
- `src/lib/server/effect/*`
  - Effect 用の共通 error / service helpers を置く。最初は小さく保つ。
- `src/lib/server/db/*.ts`
  - Drizzle 移行対象の repository。全置換せず、task ごとに小さく移す。
- `tests/unit/*`
  - Effect 境界や Drizzle schema helper の純粋テストを追加する。
- `tests/integration/*`
  - repository/API の挙動が SQL 直書き時代から変わらないことを確認する。
- `README.md` / `CONTRIBUTING.md`
  - 新しい品質コマンドと導入済みツールを説明する。

## Guiding Rules

- 依存追加は目的ごとに分ける。formatter/linter/Effect/Drizzle を一つの巨大 commit に混ぜない。
- formatter の全面差分は logic change と分離する。
- Effect は最初からアプリ全体へ広げない。API error、D1 error、service boundary のような失敗表現が明確な場所だけを対象にする。
- Drizzle はまず schema mirror として入れる。既存 `migrations/*.sql` を source of truth として扱い、実データ移行や挙動変更を同時にしない。
- CI は段階的に厳しくする。導入直後に全 check を必須化して作業不能にしない。
- D1 binding 名 `DB`、period-first model、same-day spending rule は維持する。
- Deploy scripts は変更しない。preview / production deploy は必ず `pnpm run deploy:preview` / `pnpm run deploy:production` を使う。

## Task 1: Add Baseline CI

**Implementation subagent:** `ci-tooling-implementer`

**Ownership:**

- Create: `.github/workflows/ci.yml`
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`
- Do not modify: `package.json`, `pnpm-lock.yaml`, application source, migrations, deploy scripts

- [ ] **Step 1: Re-read required context**

Implementation subagent reads:

```bash
sed -n '1,220p' AGENTS.md
sed -n '1,220p' README.md
sed -n '1,220p' CONTRIBUTING.md
sed -n '1,220p' docs/superpowers/plans/2026-05-01-quality-tooling-effect-drizzle.md
```

- [ ] **Step 2: Create minimal GitHub Actions workflow**

Create `.github/workflows/ci.yml`.

Use:

- `pull_request`
- `push` to `main`
- `ubuntu-latest`
- Node.js `20`
- pnpm `9`
- `actions/checkout`
- `pnpm/action-setup`
- `actions/setup-node` with pnpm cache

Run commands in this order:

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test:unit
pnpm test:integration
pnpm build
```

- [ ] **Step 3: Keep E2E out of the baseline gate**

Do not add Playwright browser install or `pnpm test:e2e` to the required baseline CI. E2E policy is decided in Task 9.

- [ ] **Step 4: Document baseline CI**

Update `README.md` and `CONTRIBUTING.md` so the documented verification order matches CI:

```bash
pnpm check
pnpm test:unit
pnpm test:integration
pnpm build
```

- [ ] **Step 5: Verify locally**

Run:

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test:unit
pnpm test:integration
pnpm build
git diff --check
```

- [ ] **Step 6: Spec review checkpoint**

Ask a reviewer subagent:

```text
Review Task 1 only. Check that CI is minimal, uses Node 20 and pnpm 9, runs only install/check/unit/integration/build, does not deploy, does not require E2E, and documents the same command order in README/CONTRIBUTING. Flag accidental app, migration, lockfile, wrangler, or deploy-script changes.
```

- [ ] **Step 7: Code-quality review checkpoint**

Ask a reviewer subagent:

```text
Review the baseline CI workflow for maintainability and GitHub Actions correctness. Check action ordering, pnpm cache setup, shell portability, permissions, and whether the workflow can run in a fresh checkout without hidden local state.
```

**Acceptance Criteria:**

- `.github/workflows/ci.yml` exists.
- CI runs on PR and `main` push.
- CI command order is install, check, unit, integration, build.
- E2E is not required.
- README / CONTRIBUTING show the same baseline command order.
- Local baseline commands and `git diff --check` pass.

**Likely Pitfalls:**

- Do not add bare `wrangler deploy`.
- Do not use the placeholder top-level D1 database id in CI.
- Integration tests may reveal missing setup. Fix CI setup, not app behavior, unless the failure exposes a real bug.
- `.github` may not exist yet; create the directory.

**Commit Boundary:**

```bash
git add .github/workflows/ci.yml README.md CONTRIBUTING.md
git commit -m "ci: add baseline checks"
```

## Task 2: Add Formatter

**Implementation subagent:** `formatter-implementer`

**Ownership:**

- Create: `.prettierrc`
- Create: `.prettierignore`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`
- May modify: formatting-only changes from `pnpm format`
- Do not modify: behavior, test semantics, Cloudflare config, migrations

- [ ] **Step 1: Confirm Task 1 is complete**

Check that `.github/workflows/ci.yml` exists and working tree changes are understood:

```bash
git status --short
test -f .github/workflows/ci.yml
```

- [ ] **Step 2: Add Prettier dependencies**

Run:

```bash
pnpm add -D prettier prettier-plugin-svelte
```

- [ ] **Step 3: Add formatter scripts**

Add to `package.json`:

```json
{
  "format": "prettier --write .",
  "format:check": "prettier --check ."
}
```

- [ ] **Step 4: Add minimal Prettier config**

Create `.prettierrc` with only the required baseline for Svelte support. Avoid subjective style churn beyond the repo's default Prettier behavior.

- [ ] **Step 5: Add ignore rules**

Create `.prettierignore` and exclude at least:

```gitignore
node_modules
.svelte-kit
build
.wrangler
.tmp-*
test-results
playwright-report
.env
.env.*
.dev.vars
```

- [ ] **Step 6: Run formatter**

Run:

```bash
pnpm format
pnpm format:check
```

Inspect the diff. It must be formatting-only.

- [ ] **Step 7: Document formatter usage**

Update `README.md` / `CONTRIBUTING.md` with:

```bash
pnpm format
pnpm format:check
```

- [ ] **Step 8: Verify baseline**

Run:

```bash
pnpm check
pnpm test:unit
pnpm test:integration
pnpm build
git diff --check
```

- [ ] **Step 9: Spec review checkpoint**

Ask a reviewer subagent:

```text
Review Task 2 only. Confirm this is a formatter-only change plus docs/scripts/deps. Check .prettierignore protects .wrangler, .tmp-*, test-results, env/local artifacts, node_modules, and generated build output. Flag behavior edits, migration edits, broad manual refactors, or user-visible text changes hidden inside formatting.
```

- [ ] **Step 10: Code-quality review checkpoint**

Ask a reviewer subagent:

```text
Review the Prettier setup for maintainability. Check that scripts are simple, config is minimal, the ignore list avoids local/runtime artifacts, and formatting does not fight future ESLint rules.
```

**Acceptance Criteria:**

- `format` and `format:check` scripts exist.
- `.prettierrc` and `.prettierignore` exist.
- `pnpm format:check` passes.
- Formatting diff does not include behavior changes.
- Baseline checks pass.

**Likely Pitfalls:**

- Do not stage `.wrangler`, `.tmp-*`, `test-results`, `.dev.vars`, or env files.
- Do not combine formatter changes with linter or app logic changes.
- Do not manually alter product copy or Playwright selectors while formatting.
- Lockfile changes should be limited to Prettier-related packages.

**Commit Boundary:**

```bash
git add package.json pnpm-lock.yaml .prettierrc .prettierignore README.md CONTRIBUTING.md
git add src tests docs '*.ts' '*.js' '*.svelte' '*.md' '*.json' '*.jsonc'
git diff --cached --check
git commit -m "chore: add prettier formatting"
```

## Task 3: Add Linter

**Implementation subagent:** `linter-implementer`

**Ownership:**

- Create: `eslint.config.js`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`
- May modify: minimal source/test fixes required for initial lint pass
- Prerequisite: Task 2 is complete and `format:check` exists

- [ ] **Step 1: Confirm formatter baseline**

Run:

```bash
pnpm format:check
```

- [ ] **Step 2: Add ESLint dependencies**

Run:

```bash
pnpm add -D eslint typescript-eslint eslint-plugin-svelte globals
```

- [ ] **Step 3: Create ESLint flat config**

Create `eslint.config.js` for SvelteKit + Svelte 5 + TypeScript.

Guidelines:

- Use flat config.
- Include `.svelte` files.
- Do not duplicate Prettier style rules.
- Start with practical correctness rules that can pass without broad rewrites.
- Do not start with strict rules such as global `no-explicit-any` if they cause large churn.

- [ ] **Step 4: Add lint script**

Add to `package.json`:

```json
{
  "lint": "eslint ."
}
```

- [ ] **Step 5: Run lint and fix minimal issues**

Run:

```bash
pnpm lint
```

Fix only issues required for the initial baseline, such as unused imports or config ignores. Do not change period logic, UI text, selectors, or route behavior.

- [ ] **Step 6: Document lint usage**

Update `README.md` / `CONTRIBUTING.md` with `pnpm lint` and the post-formatter verification order.

- [ ] **Step 7: Verify**

Run:

```bash
pnpm format:check
pnpm lint
pnpm check
pnpm test:unit
pnpm test:integration
pnpm build
git diff --check
```

- [ ] **Step 8: Spec review checkpoint**

Ask a reviewer subagent:

```text
Review Task 3 only. Check ESLint config is Svelte 5/TypeScript compatible, uses flat config, avoids Prettier-overlapping style churn, and passes with minimal source changes. Flag broad refactors, changed product copy/selectors, period-first behavior changes, or ignored directories that hide real source files.
```

- [ ] **Step 9: Code-quality review checkpoint**

Ask a reviewer subagent:

```text
Review the lint configuration for maintainability and signal quality. Check that src, tests, Svelte config, and Vite config are linted; generated/local directories are ignored; and rule choices are useful without creating excessive churn.
```

**Acceptance Criteria:**

- `eslint.config.js` exists and works as flat config.
- `pnpm lint` passes.
- `pnpm format:check` and `pnpm lint` do not conflict.
- Source/test edits are minimal and behavior-preserving.
- Docs include lint usage.

**Likely Pitfalls:**

- ESLint ignore rules must not hide `src/`, `tests/`, `svelte.config.js`, or `vite.config.ts`.
- `.svelte` files must actually be linted.
- Do not make first-pass lint rules so strict that they force broad refactors.
- Do not change user-visible Japanese text or E2E selectors while fixing lint.

**Commit Boundary:**

```bash
git add package.json pnpm-lock.yaml eslint.config.js README.md CONTRIBUTING.md
git add src tests '*.ts' '*.js' '*.svelte'
git diff --cached --check
git commit -m "chore: add eslint linting"
```

## Task 4: Extend CI With Formatter And Linter

**Implementation subagent:** `ci-quality-gate-implementer`

**Ownership:**

- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`
- Prerequisite: Tasks 1-3 are complete

- [ ] **Step 1: Confirm scripts exist**

Run:

```bash
pnpm format:check
pnpm lint
```

If either script is missing, stop and return `BLOCKED`: Task 2 or Task 3 is incomplete.

- [ ] **Step 2: Update CI command order**

Update `.github/workflows/ci.yml` so the install step is followed by:

```bash
pnpm format:check
pnpm lint
pnpm check
pnpm test:unit
pnpm test:integration
pnpm build
```

- [ ] **Step 3: Keep job shape simple**

Keep one job unless the workflow has already become slow or hard to read. If splitting, use clear job names such as `quality` and `test-build`.

- [ ] **Step 4: Keep E2E out of this task**

Do not add `pnpm test:e2e` here. E2E policy is decided in Task 9.

- [ ] **Step 5: Align docs**

Update README / CONTRIBUTING verification sections so the command order matches CI.

- [ ] **Step 6: Verify locally**

Run:

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm check
pnpm test:unit
pnpm test:integration
pnpm build
```

- [ ] **Step 7: Spec review checkpoint**

Ask a reviewer subagent:

```text
Review Task 4 only. Confirm CI runs format:check, lint, check, unit, integration, build in that order; README/CONTRIBUTING match; E2E is not required; and no bare wrangler deploy, D1 database id, deploy script, or app behavior was changed.
```

- [ ] **Step 8: Code-quality review checkpoint**

Ask a reviewer subagent:

```text
Review the CI quality gate shape. Check job readability, cache reuse, failure clarity, and whether formatter/linter failures appear before slower tests.
```

**Acceptance Criteria:**

- CI runs formatter, linter, typecheck, unit, integration, build on PR / `main` push.
- README / CONTRIBUTING match the CI command order.
- E2E is not required.

**Likely Pitfalls:**

- If `.github/workflows/ci.yml` does not exist, Task 1 is incomplete.
- If `pnpm lint` or `pnpm format:check` is undefined, Tasks 2-3 are incomplete.
- Do not touch deploy scripts or `wrangler.jsonc`.

**Commit Boundary:**

```bash
git add .github/workflows/ci.yml README.md CONTRIBUTING.md
git commit -m "ci: enforce formatting and linting"
```

## Task 5: Introduce Effect Thinly

**Implementation subagent:** `effect-boundary-implementer`

**Ownership:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `src/lib/server/effect/errors.ts`
- Create: `src/lib/server/effect/result.ts`
- Modify: one small server-side boundary only
- Test: `tests/unit/*`
- Test: relevant `tests/integration/*`

**Recommended first boundary:** API response error mapping. Prefer a small boundary around existing API error conversion rather than rewriting services.

- [ ] **Step 1: Inspect existing errors**

Search existing error classes and API error mapping:

```bash
rg -n "Error|toApiErrorResponse|error\\.code|status" src/lib/server src/routes tests
```

Identify the single boundary to convert. Good candidates:

- API response error mapping.
- D1 repository error wrapping.
- Day entry service failure states.

- [ ] **Step 2: Add Effect dependency**

Run:

```bash
pnpm add effect
```

`effect` is a runtime dependency because server-side application code will import it.

- [ ] **Step 3: Add minimal Effect error model**

Create `src/lib/server/effect/errors.ts`.

Model only existing behavior:

- validation
- not found
- conflict / overlap
- database
- unknown / internal

Do not expose raw database messages to API responses.

- [ ] **Step 4: Add result / mapping helper**

Create `src/lib/server/effect/result.ts`.

Use it to map existing `Error` / `code`-bearing exceptions to the current API response shape.

- [ ] **Step 5: Wire exactly one boundary**

Update the selected boundary to use the helper. Do not convert all services to `Effect.gen`. Do not change API route names, status codes, `error.code`, or response body shape.

- [ ] **Step 6: Add focused tests**

Add or update tests to freeze:

- validation error mapping
- not found mapping
- conflict / overlap mapping if present
- internal error masking

Also run relevant integration tests for existing API behavior.

- [ ] **Step 7: Verify**

Run:

```bash
pnpm format:check
pnpm lint
pnpm check
pnpm test:unit
pnpm test:integration
pnpm build
```

Focused commands if the boundary touches period/day APIs:

```bash
pnpm test:integration tests/integration/api/periods.test.ts
pnpm test:integration tests/integration/api/days.test.ts
```

- [ ] **Step 8: Spec review checkpoint**

Ask a reviewer subagent:

```text
Review Task 5 only. Confirm Effect is limited to one API/error boundary, services/repositories were not broadly rewritten, existing error.code and HTTP status behavior is preserved, unknown errors are masked, and period-first / same-day spending behavior is untouched.
```

- [ ] **Step 9: Code-quality review checkpoint**

Ask a reviewer subagent:

```text
Review the Effect boundary for maintainability. Check that Effect improves error modeling without adding unnecessary abstraction, keeps throw/Effect interop readable, and avoids duplicate error taxonomies that will drift.
```

**Acceptance Criteria:**

- `effect` is added as a runtime dependency.
- Effect usage is limited to one narrow boundary.
- API status code, `error.code`, and response shape remain stable.
- Domain logic does not change.
- Focused unit tests cover the error mapping.
- Full local gate passes.

**Likely Pitfalls:**

- Do not Effect-convert `DayEntryService` or repositories wholesale.
- Do not break existing `PeriodValidationError`, `PeriodNotFoundError`, `DateOutOfPeriodError`, or their codes.
- Do not leak raw DB/secret details in unknown errors.
- State the runtime dependency reason in commit/PR text.

**Commit Boundary:**

```bash
git add package.json pnpm-lock.yaml src/lib/server/effect tests README.md CONTRIBUTING.md
git commit -m "feat: add effect error boundary"
```

## Task 6: Add Drizzle As Schema Mirror

**Implementation subagent:** `drizzle-schema-mirror-implementer`

**Ownership:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `drizzle.config.ts`
- Create: `src/lib/server/db/schema.ts`
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`
- Optional test: schema-focused unit test

- [ ] **Step 1: Add Drizzle dependencies**

Run:

```bash
pnpm add drizzle-orm
pnpm add -D drizzle-kit
```

`drizzle-orm` is runtime. `drizzle-kit` is development tooling.

- [ ] **Step 2: Mirror current SQL schema**

Use `migrations/0002_reset_to_budget_periods.sql` as the practical current schema. Create `src/lib/server/db/schema.ts` for:

- `budget_periods`
- `daily_totals`
- `daily_operation_histories`

Keep DB names as snake_case in the Drizzle schema. Do not confuse them with existing camelCase record types.

- [ ] **Step 3: Mirror constraints and indexes**

Represent what Drizzle can represent for:

- `budget_periods.id` primary key
- `budget_periods.status` default and allowed values
- `budget_periods.predecessor_period_id` self reference
- `daily_totals` composite primary key `(budget_period_id, date)`
- `daily_totals.budget_period_id` reference
- `daily_operation_histories.budget_period_id` reference
- `idx_budget_periods_start_end`
- `idx_daily_totals_period_date`
- `idx_daily_histories_period_date_created_at`

Document any SQL `CHECK` constraints that Drizzle cannot faithfully encode.

- [ ] **Step 4: Add Drizzle config**

Create `drizzle.config.ts` for this repository. Do not change deploy scripts. Do not add a path that encourages bare `wrangler deploy`.

- [ ] **Step 5: Document source-of-truth policy**

Update README / CONTRIBUTING:

- Drizzle schema is a mirror at this stage.
- SQL migrations under `migrations/*.sql` remain source of truth.
- Generated migrations are not adopted yet.
- Drift check policy is decided later.

- [ ] **Step 6: Verify**

Run:

```bash
pnpm format:check
pnpm lint
pnpm check
pnpm test:unit
pnpm test:integration
pnpm build
pnpm run cf:migrate:local
```

Optional:

```bash
pnpm drizzle-kit check
```

Do not make `drizzle-kit check` required if the migration workflow is not yet stable.

- [ ] **Step 7: Spec review checkpoint**

Ask a reviewer subagent:

```text
Review Task 6 only. Compare migrations/*.sql with src/lib/server/db/schema.ts. Confirm the 3 current tables, columns, nullability, defaults, primary keys, references, and indexes are mirrored; monthly_budgets is not revived; existing repositories are not migrated; SQL migrations remain documented as source of truth; and deploy scripts/wrangler config are unchanged.
```

- [ ] **Step 8: Code-quality review checkpoint**

Ask a reviewer subagent:

```text
Review the Drizzle schema mirror for maintainability. Check type naming, snake_case/camelCase boundaries, config clarity, and whether the schema can be imported by TypeScript checks without requiring Cloudflare credentials.
```

**Acceptance Criteria:**

- Drizzle dependencies are added in the correct dependency sections.
- `src/lib/server/db/schema.ts` mirrors the current three-table schema.
- Existing repositories are not replaced yet.
- Generated migrations are not treated as source of truth.
- `pnpm run cf:migrate:local` passes.
- Deploy commands and D1 binding policy remain unchanged.

**Likely Pitfalls:**

- `migrations/0002_reset_to_budget_periods.sql` is the practical current period-first reset schema.
- Do not reintroduce `monthly_budgets`.
- `budget_period_id` is required in daily totals and histories.
- Do not use placeholder D1 database id in a way that affects deploys.
- Do not mix schema mirror with repository migration.

**Commit Boundary:**

```bash
git add package.json pnpm-lock.yaml drizzle.config.ts src/lib/server/db/schema.ts README.md CONTRIBUTING.md
git commit -m "feat: add drizzle schema mirror"
```

## Task 7: Define Drizzle And Effect Boundaries

**Implementation subagents:**

- `db-boundary-implementer`: owns `src/lib/server/db/client.ts`, `src/lib/server/db/schema.ts`, selected `src/lib/server/db/*.ts`
- `effect-boundary-implementer`: owns `src/lib/server/effect/*` and thin repository/API error helpers
- Main agent: integrates and resolves cross-file decisions

**Ownership:**

- Modify: `src/lib/server/db/client.ts`
- Modify: `src/lib/server/effect/*`
- Modify: selected `src/lib/server/db/*.ts` only if needed
- Test: `tests/unit/*`
- Test: `tests/integration/*`

- [ ] **Step 1: Freeze responsibility split**

Use this split:

- Drizzle owns typed SQL construction, row selection, and DB row mapping.
- Effect owns failure modeling, dependency composition, and service-level control flow.
- Domain/services own period state, same-day spend behavior, and recommendation calculations.

- [ ] **Step 2: Preserve test-time in-memory path**

Keep the existing in-memory database/repository path usable for tests. Do not force every unit/integration test through real D1.

- [ ] **Step 3: Add the smallest D1/Drizzle adapter if needed**

If a bridge is needed, make it accept the existing D1 binding `DB` and keep repository public contracts stable.

- [ ] **Step 4: Keep Effect errors aligned with current behavior**

Use only existing behavior names:

- validation
- not found
- conflict / overlap
- database

Avoid a second, drifting taxonomy. Prefer thin mappers when existing error classes are already adequate.

- [ ] **Step 5: Prove the boundary with one helper or one repository**

Do not migrate all repositories in this task. Show the boundary with the smallest useful slice, preferably budget-period related.

- [ ] **Step 6: Verify**

Run:

```bash
pnpm format:check
pnpm lint
pnpm check
pnpm test:unit
pnpm test:integration
pnpm build
```

If the boundary touches budget periods:

```bash
pnpm test:unit tests/unit/budget-period.test.ts
pnpm test:integration tests/integration/api/periods.test.ts
```

- [ ] **Step 7: Spec review checkpoint**

Ask a reviewer subagent:

```text
Review Task 7. Confirm Drizzle is limited to query/row mapping, Effect is limited to failure/dependency boundary, domain decisions remain in services/domain modules, public repository interfaces are stable, API response shape is unchanged, in-memory tests still work, and period-first / budget_period_id contracts are maintained.
```

- [ ] **Step 8: Code-quality review checkpoint**

Ask a reviewer subagent:

```text
Review Task 7 for maintainability. Check whether DatabaseClient abstractions are too broad, whether throw/Effect interop is readable, whether month-first legacy code was touched unnecessarily, and whether the chosen boundary reduces future repository migration risk.
```

**Acceptance Criteria:**

- Drizzle and Effect responsibilities are clear in code.
- Repository public interfaces are not broadly changed.
- API routes, response fields, and status mapping are unchanged.
- In-memory test path remains intact.
- `budget_period_id` period-first contract is preserved.

**Likely Pitfalls:**

- Existing `DatabaseClient` is in-memory transaction-oriented; do not over-generalize it into a large D1 transaction abstraction.
- `month-repository.ts` is legacy-ish month-first surface. Avoid touching it unless required.
- Do not push same-day spend logic into DB boundary.
- Do not leave a confusing mix of `throw` and `Effect` returns across many layers.

**Commit Boundary:**

```bash
git add src/lib/server/effect src/lib/server/db tests
git commit -m "feat: define db effect boundary"
```

## Task 8: Migrate Repositories Incrementally

**Implementation subagents:**

- `budget-period-repo-implementer`: owns `src/lib/server/db/budget-period-repository.ts`
- `daily-total-repo-implementer`: owns `src/lib/server/db/daily-total-repository.ts`
- `daily-history-repo-implementer`: owns `src/lib/server/db/daily-history-repository.ts`
- `verification-subagent`: runs focused and full verification without modifying source
- Main agent: integrates between repository tasks

**Ownership:**

- Modify: `src/lib/server/db/budget-period-repository.ts`
- Modify: `src/lib/server/db/daily-total-repository.ts`
- Modify: `src/lib/server/db/daily-history-repository.ts`
- Modify only if necessary: `src/lib/server/services/day-entry-service.ts`
- Modify only if necessary: `src/lib/server/services/month-summary-service.ts`
- Test: `tests/unit/*`
- Test: `tests/integration/*`
- Test if UI behavior is affected: `tests/e2e/*`

- [ ] **Step 1: Migrate `budget-period-repository` first**

Replace runtime D1 query construction with Drizzle while preserving:

- `findById`
- `findByDate`
- `listPeriods`
- `createPeriod`
- `updatePeriod`
- overlap validation
- predecessor continuity
- successor continuity

Keep SQL migrations as source of truth.

- [ ] **Step 2: Verify period repository behavior**

Run:

```bash
pnpm test:unit tests/unit/budget-period.test.ts
pnpm test:integration tests/integration/api/periods.test.ts
```

Review before moving on.

- [ ] **Step 3: Migrate `daily-total-repository`**

Preserve:

- composite key `(budget_period_id, date)`
- all queries scoped by `budget_period_id`
- `upsertDailyTotal` semantics
- `year_month` persistence as existing compatibility data, not source of truth
- same-day spend rule remaining outside DB layer

- [ ] **Step 4: Verify day entry and summary behavior**

Run:

```bash
pnpm test:integration tests/integration/api/days.test.ts
pnpm test:unit tests/unit/month-summary-service.test.ts
```

Review before moving on.

- [ ] **Step 5: Migrate `daily-history-repository`**

Preserve:

- operation history response shape
- `memo` null handling
- ordering by `created_at DESC`
- any existing tie-breaker behavior, such as `id DESC`, if present in current SQL
- all queries scoped by `budget_period_id`

- [ ] **Step 6: Run full local gate**

Run:

```bash
pnpm format:check
pnpm lint
pnpm check
pnpm test:unit
pnpm test:integration
pnpm build
```

If dashboard rendering or day-entry UI behavior may be affected:

```bash
pnpm test:e2e tests/e2e/dashboard.spec.ts
pnpm test:e2e tests/e2e/dashboard-day-entry.spec.ts
```

If D1 schema confidence is needed:

```bash
pnpm run cf:migrate:local
```

- [ ] **Step 7: Spec review checkpoint per repository**

Ask a reviewer subagent after each repository migration:

```text
Review this repository migration only. Compare the previous SQL behavior to the Drizzle implementation. Check query conditions, ordering, upsert semantics, budget_period_id scoping, snake_case/camelCase mapping, validation preservation, and API-visible response stability.
```

- [ ] **Step 8: Code-quality review checkpoint per repository**

Ask a reviewer subagent:

```text
Review the repository migration for maintainability. Check whether Drizzle expressions are readable, row mapping is centralized enough without over-abstracting, tests cover the changed behavior, and no formatter/linter churn is mixed into the logic commit.
```

**Acceptance Criteria:**

- Runtime D1 repositories use Drizzle query construction.
- Repository interfaces are preserved unless explicitly documented.
- Period-first behavior is preserved.
- Same-day spending does not recalculate today's bonus/adjustment.
- History ordering and API response shape are stable.
- Full local gate passes.

**Likely Pitfalls:**

- `daily_totals` primary key is `(budget_period_id, date)`, not date alone.
- `daily_operation_histories` ordering can affect UI/API snapshots.
- `year_month` exists but is not the source of truth.
- D1 `ON CONFLICT` / `returning` support can differ; create/update then re-fetch is often safer.
- Do not mix formatter/linter churn into repository migration commits.

**Commit Boundaries:**

```bash
git add src/lib/server/db/budget-period-repository.ts tests
git commit -m "feat: migrate budget period repository to drizzle"

git add src/lib/server/db/daily-total-repository.ts tests
git commit -m "feat: migrate daily totals repository to drizzle"

git add src/lib/server/db/daily-history-repository.ts tests
git commit -m "feat: migrate daily history repository to drizzle"
```

## Task 9: Finalize CI Shape

**Implementation subagents:**

- `ci-shape-implementer`: owns `.github/workflows/ci.yml`, `package.json`
- `docs-implementer`: owns `README.md`, `CONTRIBUTING.md`
- `verification-subagent`: runs local gate and checks GitHub Actions parity

**Ownership:**

- Modify: `.github/workflows/ci.yml`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`

- [ ] **Step 1: Decide final required PR gate**

Default required PR gate:

```bash
pnpm format:check
pnpm lint
pnpm check
pnpm test:unit
pnpm test:integration
pnpm build
```

- [ ] **Step 2: Decide E2E policy**

Choose one and document it:

- Preferred initial policy: PR optional/manual, `main` push or scheduled run for `pnpm test:e2e`.
- Strict policy: required PR gate only if D1 seed/reset and Playwright runtime are stable in CI.

- [ ] **Step 3: Decide Drizzle drift policy**

If generated migrations are adopted, add a drift check. If SQL migrations remain source of truth, do not force generated migration checks yet. At most ensure schema imports/typechecks.

- [ ] **Step 4: Decide job layout**

Use a single job if runtime is acceptable. Split into `quality` and `test-build` only if the workflow is slow or hard to read.

- [ ] **Step 5: Update docs**

README / CONTRIBUTING must state:

- final PR gate command order
- E2E policy
- Drizzle drift policy
- no bare `wrangler deploy`

- [ ] **Step 6: Verify**

Run:

```bash
pnpm format:check
pnpm lint
pnpm check
pnpm test:unit
pnpm test:integration
pnpm build
```

If E2E is adopted:

```bash
pnpm test:e2e
```

For local UI debugging with stale D1 state:

```bash
XDG_CONFIG_HOME=/home/sh4869/ghq/github.com/sh4869221b/yosan-flow/.tmp-xdg-config YOSAN_FLOW_FORCE_IN_MEMORY_DEV=1 pnpm dev -- --host 127.0.0.1
```

- [ ] **Step 7: Spec review checkpoint**

Ask a reviewer subagent:

```text
Review Task 9. Confirm README/CONTRIBUTING and CI workflow agree on command order, PR gate and E2E policy are clear, Drizzle drift policy matches whether generated migrations are adopted, no bare wrangler deploy or placeholder D1 path is introduced, and lockfile usage is compatible with pnpm install --frozen-lockfile.
```

- [ ] **Step 8: Code-quality review checkpoint**

Ask a reviewer subagent:

```text
Review final CI shape for maintainability. Check job decomposition, caching, failure signal, runtime cost, and whether required checks are strict enough without blocking normal PR work unnecessarily.
```

**Acceptance Criteria:**

- Required CI gate is explicit and documented.
- Formatter/linter/typecheck/unit/integration/build run on PR.
- E2E policy is documented.
- Drizzle drift-check policy is documented.
- Cloudflare deploy command guidance remains environment-specific.
- Lockfile is compatible with frozen install.

**Likely Pitfalls:**

- Top-level `wrangler.jsonc` D1 id is a placeholder. Do not add CI/deploy paths that use it.
- E2E depends on D1/local state; required CI E2E needs stable seed/reset.
- Drizzle generated migration checks can conflict with SQL-source-of-truth workflow.
- Keep formatter-only and logic changes separate after this gate lands.

**Commit Boundary:**

```bash
git add .github/workflows/ci.yml package.json README.md CONTRIBUTING.md
git commit -m "ci: finalize quality gate"
```

## Final Verification Before Completion

After all tasks are implemented and reviewed, run:

```bash
pnpm format:check
pnpm lint
pnpm check
pnpm test:unit
pnpm test:integration
pnpm build
```

Also run according to adopted policy:

```bash
pnpm test:e2e
pnpm run cf:migrate:local
```

Record any skipped commands with the reason and residual risk.
