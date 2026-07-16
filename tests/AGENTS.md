# Test Knowledge Base

## Overview

Tests are divided by execution boundary: direct logic/state, handler/service/repository integration, and browser workflow against local Wrangler/D1.

## Layer Selection

- `tests/unit/`: pure rules, in-memory services, controller races, API error mapping, architecture/structure guards.
- `tests/integration/`: service fixtures, DI handler factories, default handlers with a period-aware D1 fake.
- `tests/e2e/`: visible dashboard behavior against a built Worker and migrated local D1.
- Use the narrowest layer that observes the changed contract; broad user flows still require E2E.

## Shared Rules

- Prefer direct behavioral assertions over snapshots; the suite currently uses no snapshots.
- Keep period ownership explicit in fixtures and expectations, especially `budget_period_id` filters.
- Keep clocks, IDs, and deferred network settlement deterministic.
- Preserve Japanese UI text and existing `data-testid` contracts used by Playwright.
- Do not weaken architecture guards, structure LOC limits, or reset-token checks to make a change pass.
- Coverage includes server/API unit+integration code only and is a visibility check, not a CI gate.

## Commands

```bash
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm test:coverage
```

## Local State

- Playwright owns `.tmp-wrangler-state`, `.tmp-xdg-config`, `test-results`, and `playwright-report`.
- Never commit those artifacts or reuse their state as a test fixture.
- For migration changes, run `pnpm run cf:migrate:local` before the affected integration/E2E checks.
