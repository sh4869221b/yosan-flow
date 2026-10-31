# Routes Knowledge Base

## Overview

`src/routes/**` contains one dashboard page, period-first JSON handlers, and one guarded E2E-only reset endpoint.

## Route Map

- `+page.server.ts`: list periods, select requested/current/latest, load summary.
- `+page.svelte`: thin controller/component composition.
- `api/periods/+server.ts`: period list/create.
- `api/periods/[periodId]/+server.ts`: summary read and period update.
- `api/periods/[periodId]/days/[date]/{add,overwrite}/+server.ts`: day mutations.
- `api/periods/[periodId]/days/[date]/history/**`: history read/edit/delete.
- `api/__test/reset/+server.ts`: guarded local E2E database reset.

## Handler Boundary

- Every normal API route exposes a `_create*Handler({ services })` factory. Preserve this dependency-injection seam for integration tests; public SvelteKit method exports resolve Workers services and delegate.
- Parse `periodId`, `date`, `historyId`, and request bodies through `src/lib/server/validation/**`.
- Execute every Effect through `runApiEffect` at the route/page boundary and map failures with `toApiErrorResponse`.
- Keep handlers limited to validation, service calls, and stable JSON serialization. Domain choices belong in `src/lib/server/**`.
- `getApiServices()` reads `cloudflare:workers` `env.DB` and caches services per binding. Missing DB fails closed. Only an explicit in-memory flag in Vite development bypasses D1; built Workers ignore it. Resolve request tracing from `cloudflare:workers` separately, never in the service cache.

## Response Contracts

- Period create and period summary endpoints return the period/summary object directly.
- Period list returns `{ periods }`.
- History GET returns `{ periodId, date, histories }`.
- History PATCH/DELETE returns `{ summary, histories }` after both are refreshed.
- Treat these shapes as controller and integration-test contracts, not interchangeable wrappers.

## Reset Exception

- `api/__test/reset` is the only direct-Drizzle route exception.
- Preserve token validation, local/test intent, required `DB`, delete order `history -> daily totals -> periods`, structured log payload, and before/after counts.
- Keep `tests/e2e/dashboard-shared.ts` aligned with any reset contract change.

## Verification

- API handler, response, validation, or runtime-binding changes: `pnpm test:integration`.
- Page load or dashboard wiring: `pnpm check`; add focused E2E coverage for browser-visible changes.
- Reset changes: integration-level guard coverage plus the E2E setup path.
