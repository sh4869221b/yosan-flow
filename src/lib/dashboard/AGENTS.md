# Dashboard Controller Knowledge Base

## Overview

`src/lib/dashboard/**` owns client-side period selection, modal/history state, API effects, stale-result rejection, and cross-mutation reconciliation.

## Module Map

- `page-controller.svelte.ts`: public facade; composes period, day-entry, and history controllers.
- `*-controller-state.svelte.ts`: rune state and UI-facing actions.
- `period-summary-revision.ts`: shared revision, mutation sequence, settlement, and per-period queue.
- `*-mutation-lifecycle.ts`: command orchestration and cleanup.
- `*-tracker.ts`, `*-reconciliation.ts`: freshness, authoritative refresh, best-summary selection.
- `retained-history-store.ts`: bounded offscreen mutation results.
- `api-urls.ts`, `types.ts`, `controller-types.ts`, `fetch-json.ts`: URL, wire DTO, page-type bridge, fetch boundary.
- `yen-input.ts`: shared component-facing integer-yen parser.

## State and Concurrency Rules

- `createDashboardPageController` must pass one shared `PeriodSummaryRevision` to all three controllers. Do not create independent revisions inside the facade.
- Freshness depends on period ID, selected date, request sequence, modal generation, summary revision, and mutation sequence. Preserve all relevant ownership checks before publishing async results.
- Concurrent day-entry `add` operations may overlap; history and period mutations serialize with cross-kind work for the same period.
- A mutation response is not automatically authoritative. Compare configuration, spending revision, and completeness; refetch when reconciliation is ambiguous or failed.
- Preserve offscreen success results only when period/date/revision/sequence compatibility still holds.
- Start client Effects through `runClientEffect`; use Effect finalization to clear saving and queue state.

## UI Contract

- Keep `+page.svelte` thin and build URLs only through `api-urls.ts`.
- Instantiate the facade from a function reading page data to avoid stale initial capture.
- Period ID is the summary/day/history key; never infer ownership from month or date alone.
- Treat empty yen input explicitly; do not rely on `Number("")` or truncating `parseInt` behavior.
- Keep new user-facing validation/error messages in Japanese unless nearby text is English.

## Structural Guard

- `tests/unit/dashboard-controller-structure.test.ts` enforces required modules and a pure-LOC ceiling for core controller files. Split by responsibility rather than weakening the guard.

## Verification

- State, lifecycle, tracker, revision, or reconciliation changes: `pnpm test:unit` with the matching race/interruption/offscreen suite.
- Type/rune wiring: `pnpm check`.
- Browser-visible period/day/history behavior: focused `pnpm test:e2e` coverage.
