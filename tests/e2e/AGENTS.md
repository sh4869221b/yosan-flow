# E2E Test Knowledge Base

## Overview

`tests/e2e/**` drives the built dashboard through Playwright against local Wrangler and a migrated isolated D1 state.

## Harness

- `playwright.config.ts` uses one worker, disables full parallelism, clears temp state, builds, migrates local D1, then starts Wrangler.
- Day-entry specs use `configureDashboardDayEntryE2E()` for serial mode, timeout, reset, and browser warm-up.
- `dashboard-shared.ts` owns guarded reset and shared dashboard helpers.
- `helpers/db.ts` seeds through public period/day APIs; do not bypass the product boundary with hidden state mutation.

## Synchronization

- Prefer route barriers (`page.route`, `route.fetch`, `route.fulfill`) and `Promise.withResolvers()` over sleeps.
- Match API waits by HTTP method plus exact absolute URL, especially for period/date/history race tests.
- Verify state both while a request is blocked and after it is released.
- Race tests must prove stale responses cannot overwrite a new period, date, modal session, error, input, or more-complete summary.

## Selectors

- Prefer `getByRole` / `getByLabel` for user controls.
- Use existing `data-testid` hooks for dynamic calendar cells, totals, modal, period selector, and summary values.
- Scope history row assertions to the modal and row content; preserve the existing editing-state contract.

## Reset Contract

- Reset uses the E2E token header and verifies all three tables are empty afterward.
- Never weaken the endpoint's token/local intent or D1 guard.
- If reset payload/delete order changes, update `src/routes/api/__test/reset/+server.ts` and `dashboard-shared.ts` together.

## Verification

- Run the narrowest affected Playwright spec during development, then `pnpm test:e2e` for broad dashboard workflow changes.
- Failures retain trace/screenshot/report artifacts locally; do not commit them.
