# yosan-flow Project Knowledge Base

**Generated:** 2026-07-16 JST
**Commit:** `2e67607`
**Branch:** `main`

## Overview

`yosan-flow` is a period-first budget application built with SvelteKit 2, Svelte 5, Effect, Drizzle, Cloudflare Workers, and D1. The primary UX answers how much can be spent today within the selected budget period; category analysis and month-first compatibility are intentionally outside the default design.

## Structure

```text
src/routes/              # Single dashboard page and period-first JSON API
src/lib/dashboard/       # Client controllers, mutation ordering, DTOs, URL helpers
src/lib/components/      # Dashboard, calendar, budget, and day-entry UI
src/lib/server/          # Effect services, domain rules, repositories, validation, JST time
migrations/              # D1 schema source of truth
tests/unit/              # Pure rules, controller races, architecture guards
tests/integration/       # Handler/service/repository tests with in-memory or D1 fake
tests/e2e/               # Playwright against local Wrangler and migrated D1
```

## Where To Look

| Task                      | Location                                                                             | Notes                                                    |
| ------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| Initial dashboard data    | `src/routes/+page.server.ts`                                                         | Chooses requested, current, then latest period           |
| Dashboard composition     | `src/routes/+page.svelte`                                                            | Thin wiring around the page controller and components    |
| Client state and races    | `src/lib/dashboard/`                                                                 | Period, day-entry, history, revision, reconciliation     |
| Period API                | `src/routes/api/periods/**`                                                          | CRUD, daily add/overwrite, history read/edit/delete      |
| Period summary rules      | `src/lib/server/services/period-summary/`                                            | Date range, food pace, recommendations, DTO construction |
| Day-entry commands        | `src/lib/server/services/day-entry-service.ts`, `src/lib/server/services/day-entry/` | Add, overwrite, replay, history mutations                |
| Runtime service selection | `src/lib/server/services/api-services/`                                              | D1/in-memory composition and cache                       |
| Persistence               | `src/lib/server/db/`                                                                 | Drizzle repositories plus the raw-D1 atomic writer       |
| API validation/errors     | `src/lib/server/validation/`, `src/lib/server/effect/`                               | Parsing, stable error mapping, Effect execution          |
| Schema                    | `migrations/*.sql`, `src/lib/server/db/schema.ts`                                    | SQL is authoritative; Drizzle schema is a mirror         |

## Code Map

Reference counts are authored-code LSP occurrences, excluding declarations and `.svelte-kit`; Svelte references are supplemented by Codegraph because no Svelte LSP is installed.

| Symbol / module                 | Type                  | Location                                                                 |     Refs | Role                                                  |
| ------------------------------- | --------------------- | ------------------------------------------------------------------------ | -------: | ----------------------------------------------------- |
| `load`                          | entry point           | `src/routes/+page.server.ts:21`                                          |        0 | Selects period and returns page data                  |
| `createDashboardPageController` | facade                | `src/lib/dashboard/page-controller.svelte.ts:8`                          |       2+ | Composes period, history, and day-entry controllers   |
| `createPeriodSummaryRevision`   | coordinator           | `src/lib/dashboard/period-summary-revision.ts:32`                        |       15 | Serializes cross-kind mutations and tracks freshness  |
| `runApiEffect`                  | boundary              | `src/lib/server/effect/runtime.ts:7`                                     |       62 | Executes Effect values at route/page boundaries       |
| `getApiServicesFromPlatform`    | composition           | `src/lib/server/services/api-services/cache.ts:50`                       |       18 | Selects cached D1 or in-memory services               |
| `InMemoryApiServices`           | service port          | `src/lib/server/services/api-services/types.ts:45`                       |       27 | Shared route contract despite the legacy type name    |
| `buildPeriodSummary`            | domain service        | `src/lib/server/services/period-summary/period-summary-calculator.ts:61` |       10 | Builds the authoritative period summary DTO           |
| `BudgetPeriodRepository`        | repository port       | `src/lib/server/db/budget-period-types.ts:53`                            |       23 | Owns period persistence contract                      |
| `ApiRouteError`                 | API error             | `src/lib/server/validation/month.ts:5`                                   |       15 | Stable validation/error response boundary             |
| `PeriodSummary`                 | dashboard type bridge | `src/lib/dashboard/controller-types.ts`                                  | 33 files | Carries generated page summary types into client code |

Codegraph UI flow: `+page` -> `DashboardWorkspace` -> `BudgetSummary` / `PeriodCalendar` / `PeriodSettingsPanel` / `CreatePeriodPanel`.

## Required Reading

Before editing, read `README.md`, `CONTRIBUTING.md`, and every deeper `AGENTS.md` that applies to the target path.

## Local AGENTS.md Map

- `src/routes/AGENTS.md`: route factories, response contracts, reset endpoint.
- `src/lib/dashboard/AGENTS.md`: client state ownership and mutation races.
- `src/lib/components/AGENTS.md`: Svelte UI and selector conventions.
- `src/lib/server/AGENTS.md`: server-wide domain, Effect, validation boundaries.
- `src/lib/server/db/AGENTS.md`: repositories, raw D1 writer, schema mirror.
- `src/lib/server/services/AGENTS.md`: summary/day-entry/API-service composition.
- `tests/AGENTS.md`: test-layer selection.
- `tests/{unit,integration,e2e}/AGENTS.md`: layer-specific fixtures and synchronization.

## Project Conventions

- Budget periods use `start_date` and `end_date` and may cross month boundaries. `periodId` / `budget_period_id` is the ownership key.
- Same-day spending changes today's used/remaining values, not today's bonus or adjustment. Pace incorporates it on the next day.
- A future period exposes no current-day food allowance before its start date.
- Route handlers parse, run Effect-backed services, and serialize JSON. Domain decisions stay in `src/lib/server/**`.
- `.svelte.ts` dashboard modules own rune state; ordinary `.ts` modules own Effect flows, trackers, reconciliation, and pure helpers.
- Code is primarily English; Japanese is used for product text and nearby user-facing documentation.
- `package.json` and CI pin `pnpm@11.10.0`; use that exact version for parity.

## Anti-Patterns

- Do not add month/day compatibility routes or infer selected state from a calendar month.
- Do not mutate daily totals or histories by date alone; preserve `budget_period_id` scoping.
- Do not add runtime schema bootstrap or treat Drizzle-generated migrations as authoritative.
- Do not bypass repositories/Drizzle except within the guarded raw-D1 day-entry writer family.
- Do not weaken the E2E reset token/local-intent guard.
- Do not deploy with bare `wrangler deploy`; the root D1 UUID is a placeholder.
- Do not add runtime dependencies without explicit approval.
- Do not commit `.env*`, `.dev.vars`, `.wrangler`, `.tmp-*`, `test-results`, `playwright-report`, credentials, or local D1 state.

## Commands

```bash
pnpm dev
pnpm format:check
pnpm lint
pnpm check
pnpm test:unit
pnpm test:integration
pnpm build
pnpm test:e2e
pnpm test:coverage
pnpm run cf:migrate:local
```

CI runs format/lint, check, unit, integration, build, and E2E as independent jobs, then aggregates them in `Quality checks`. Coverage is visibility-only, not a required PR gate.

## Cloudflare Notes

- Binding name is `DB`; `workers_dev` and `preview_urls` stay disabled because preview/production hosts are Access-protected.
- Use `pnpm run deploy:preview` or `pnpm run deploy:production`; apply the matching migration first and verify its environment UUID is not the all-zero placeholder.
- When bindings change, regenerate both checked-in Worker type files with the commands documented in `README.md`.
- For UI QA when local D1 state is stale: `XDG_CONFIG_HOME="$PWD/.tmp-xdg-config" YOSAN_FLOW_FORCE_IN_MEMORY_DEV=1 pnpm dev -- --host 127.0.0.1`.
