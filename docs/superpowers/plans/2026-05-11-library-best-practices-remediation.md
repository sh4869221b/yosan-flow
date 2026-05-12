# Library Best Practices Remediation Plan

**Goal:** Bring the current SvelteKit / Cloudflare Workers + D1 / Drizzle / Effect / Bits UI / pnpm tooling usage closer to the current library best practices without changing product behavior.

**Background:** A library best-practices review on 2026-05-11 found that the app passes the current lint/type/test gates, but has several maintainability and runtime-alignment gaps:

- Svelte 5 code still uses legacy component APIs (`createEventDispatcher`, `on:`, `export let`, `$:`).
- Cloudflare Worker binding types are hand-written instead of generated from `wrangler.jsonc`.
- Runtime D1 schema bootstrap duplicates SQL migrations in the request path.
- `Math.random()` remains as a fallback for history ID creation.
- pnpm version documentation and Cloudflare Build Variable guidance are out of sync with `package.json` / CI.

## Scope

In scope:

- Align pnpm / Cloudflare Build documentation with the pinned package manager version.
- Replace hand-written Cloudflare binding types with generated Wrangler environment types where practical.
- Remove `Math.random()` from production ID generation fallback paths.
- Move D1 schema creation out of normal runtime request handling and into explicit migration/test setup.
- Migrate Svelte components toward Svelte 5 runes, callback props, and event attributes.
- Preserve the existing period-first domain behavior, API response shapes, test selectors, and deploy script names.

Out of scope:

- Do not add new runtime dependencies.
- Do not adopt Drizzle-generated migrations or drift checks in this plan.
- Do not change D1 binding name `DB`.
- Do not change user-facing budget/pace calculations.
- Do not make E2E a required CI gate.

## Execution Order

### Task 1: Align Package Manager And Build-Version Documentation

**Files:**

- Modify: `README.md`
- Modify: `CONTRIBUTING.md`
- Inspect: `package.json`
- Inspect: `.github/workflows/ci.yml`

**Steps:**

- [ ] Confirm the intended pnpm version is `10.33.4`, matching `package.json` and CI.
- [ ] Update docs that still mention `10.33.3`, including Cloudflare Workers Builds `PNPM_VERSION`.
- [ ] Keep `pnpm-workspace.yaml` `onlyBuiltDependencies` / `ignoredBuiltDependencies` unchanged unless install output proves it is stale.

**Verification:**

```bash
pnpm format:check
pnpm lint
```

### Task 2: Generate And Use Cloudflare Binding Types

**Files:**

- Create or update: `worker-configuration.d.ts` or a narrower generated env type file
- Modify: `src/app.d.ts`
- Modify: `src/lib/server/db/d1-types.ts` if it can be removed or reduced safely
- Modify: `.gitignore` / formatter ignores only if generated output requires it
- Inspect: `wrangler.jsonc`

**Steps:**

- [ ] Run Wrangler type generation with a sandbox-safe config path:

```bash
XDG_CONFIG_HOME="$PWD/.tmp-xdg-config" pnpm wrangler types
```

- [ ] Prefer a checked-in generated `Cloudflare.Env` source over manually maintaining `App.Platform.env.DB`.
- [ ] Keep the E2E-only `YOSAN_FLOW_E2E_RESET_TOKEN` type explicit if it is not represented in `wrangler.jsonc`.
- [ ] Remove or narrow `src/lib/server/db/d1-types.ts` so D1 types come from the generated Worker runtime types where possible.
- [ ] Document the rerun condition: rerun `wrangler types` whenever `wrangler.jsonc` bindings change.

**Acceptance criteria:**

- `App.Platform.env` is derived from generated Wrangler types.
- No production binding shape is duplicated by hand.
- Type generation is reproducible without writing to `~/.config`.

**Verification:**

```bash
XDG_CONFIG_HOME="$PWD/.tmp-xdg-config" pnpm wrangler types
pnpm check
pnpm test:unit -- tests/unit/db-boundary.test.ts
```

### Task 3: Remove `Math.random()` From ID Generation

**Files:**

- Modify: `src/lib/server/services/day-entry-service.ts`
- Modify: `src/lib/server/services/month-summary-service.ts`
- Add or modify: focused unit tests for history ID generation if needed

**Steps:**

- [ ] Extract one shared history ID helper to avoid duplicate fallback logic.
- [ ] Use `crypto.randomUUID()` as the primary path.
- [ ] If a fallback is still needed, use `crypto.getRandomValues()`; otherwise fail closed with a clear error.
- [ ] Preserve `createHistoryId` injection for tests.

**Acceptance criteria:**

- No `Math.random()` remains under `src/`.
- Test overrides can still create deterministic duplicate IDs for rollback tests.

**Verification:**

```bash
pnpm test:unit
pnpm test:integration -- tests/integration/api/months.test.ts tests/integration/api/days.test.ts
```

### Task 4: Remove Runtime D1 Schema Bootstrap From Request Path

**Files:**

- Modify: `src/lib/server/services/month-summary-service.ts`
- Modify: D1 repository constructors if they currently depend on `ensureSchema`
- Modify: `playwright.config.ts`
- Modify: `tests/integration/helpers/period-d1-fake.ts` only if needed
- Modify: `tests/unit/non-migration-drizzle-guard.test.ts`
- Update: `README.md`
- Update: `CONTRIBUTING.md`

**Steps:**

- [ ] Replace runtime `CREATE TABLE IF NOT EXISTS` bootstrap with an explicit assumption that D1 migrations have been applied.
- [ ] Update Playwright `webServer.command` to apply local D1 migrations before `wrangler dev` starts:

```bash
XDG_CONFIG_HOME="$PWD/.tmp-xdg-config" pnpm wrangler d1 migrations apply DB --local --persist-to "$PWD/.tmp-wrangler-state"
```

- [ ] Keep local Vite-only development on the existing in-memory fallback path.
- [ ] Ensure production/preview fail loudly if migrations are missing instead of silently creating runtime schema.
- [ ] Strengthen the non-migration Drizzle guard so DDL/bootstrap SQL does not return under `src/lib/server`.

**Acceptance criteria:**

- Request handling no longer creates or updates schema.
- `migrations/*.sql` remains the only schema creation source.
- E2E still starts with a migrated local D1 state.

**Verification:**

```bash
pnpm run cf:migrate:local
pnpm test:unit -- tests/unit/non-migration-drizzle-guard.test.ts
pnpm test:integration
pnpm test:e2e
```

### Task 5: Migrate Svelte Components Toward Svelte 5 APIs

**Files:**

- Modify: `src/routes/+page.svelte`
- Modify: `src/lib/components/BudgetSummary.svelte`
- Modify: `src/lib/components/DayEntryModal.svelte`
- Modify: `src/lib/components/PeriodCalendar.svelte`
- Modify: `src/lib/components/PeriodRangePicker.svelte`
- Modify: `src/lib/components/HistoryPanel.svelte`

**Steps:**

- [ ] Convert component props from `export let` to `$props()`.
- [ ] Convert writable component state to `$state(...)`.
- [ ] Convert pure derivations from `$:` to `$derived(...)`.
- [ ] Replace `createEventDispatcher` with typed callback props:
  - `BudgetSummary`: `savePeriod`, `selectPeriod`
  - `PeriodCalendar`: `requestEdit`
  - `PeriodRangePicker`: `change`
  - `DayEntryModal`: `close`, `save`
- [ ] Replace DOM `on:` directives with event attributes (`onclick`, `onchange`, `onsubmit`, etc.).
- [ ] Move event modifier behavior such as `preventDefault` into handler functions.
- [ ] Preserve all visible labels and `data-testid` selectors.

**Acceptance criteria:**

- No `createEventDispatcher` remains.
- No `on:` event directives remain in `.svelte` files.
- Component behavior and E2E selectors remain unchanged.

**Verification:**

```bash
pnpm format
pnpm lint
pnpm check
pnpm test:unit
pnpm test:integration
pnpm build
pnpm test:e2e
```

## Review Checkpoints

After each task:

- [ ] Check `git diff --check`.
- [ ] Review that the diff is limited to the task scope.
- [ ] Run the task-specific verification commands.

After Task 5:

- [ ] Run the full baseline gate.
- [ ] Run E2E because the main dashboard workflow and event wiring changed.
- [ ] Re-review the original best-practice findings and confirm each has been resolved or intentionally deferred.

## Rollout Notes

- Tasks 1 and 3 are low-risk and can be merged independently.
- Task 2 may create generated type churn; keep it separate so review can focus on Cloudflare typing.
- Task 4 affects local/E2E setup and should not be combined with UI migration.
- Task 5 is the largest UI-only change. Keep product behavior unchanged and rely on Playwright for the main workflow.
