# Unit Test Knowledge Base

## Overview

`tests/unit/**` covers five domains: dashboard concurrency, period-summary rules, pure client/date helpers, server/DB boundaries, and structural architecture guards.

## Where To Look

- `day-entry-controller-*`, `history-*`, `period-controller-*`, `cross-kind-*`, `mutation-*`: async ownership, revision, and reconciliation.
- `month-summary-*`, `budget-period.test.ts`, `day-entry-replay.test.ts`: period math and replay invariants.
- `calendar-grid.test.ts`, `client-yen-input.test.ts`, `dashboard-api.test.ts`, `jst.test.ts`: pure boundaries.
- `api-error-response.test.ts`, `db-boundary.test.ts`, `non-migration-drizzle-guard.test.ts`: server architecture.
- `dashboard-controller-structure.test.ts`, `budget-summary-structure.test.ts`: required splits and LOC ceilings.

## Race-Test Rules

- Control ordering with `Promise.withResolvers()`, explicit response settlement, and `vi.waitFor`; do not use arbitrary sleeps.
- Assert ownership before and after release: period ID, date, modal generation, request/mutation sequence, and summary revision.
- When stubbing global `fetch`, restore globals in `afterEach` with `vi.unstubAllGlobals()`.
- Exercise both stale/current settlement orders and failure reconciliation when changing a lifecycle or tracker.

## Fixtures

- `day-entry-controller-test-fixtures.ts` is the shared complete `PeriodSummary`/JSON fixture used by many controller suites. Update all consumers when its contract changes.
- `helpers/period-summary.ts` builds summary tests through an in-memory repository and Effect boundary.
- Keep each test's time, IDs, and period/date values explicit when ordering matters.

## Architecture Guards

- Raw D1 allowlists and runtime-DDL prohibitions encode the persistence boundary; do not broaden them for convenience.
- Structure tests encode deliberate module decomposition. Split responsibilities before increasing limits.

## Verification

- Run `pnpm test:unit` plus `pnpm check` for TypeScript/Svelte controller changes.
