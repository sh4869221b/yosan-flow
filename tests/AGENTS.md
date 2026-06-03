# Tests Agent Notes

## Scope

Applies to `tests/**`.

## Test Layers

- `tests/unit/` covers pure domain logic, date math, service behavior with in-memory repositories, API error mapping, and DB boundary guards.
- `tests/integration/` calls SvelteKit route handlers directly with `Request` objects and mocked `platform.env.DB`.
- `tests/e2e/` drives the dashboard through Playwright against a local Wrangler server.

## Patterns

- Unit tests use Vitest `describe`/`it` and small fixtures. Prefer direct function/service assertions over broad snapshots.
- Integration tests use `tests/integration/helpers/period-d1-fake.ts` for D1 behavior. Keep fake SQL expectations aligned with repository filters, especially `budget_period_id`.
- E2E specs are serial and reset data through `tests/e2e/dashboard-shared.ts`.
- Seed E2E data through API helpers such as `tests/e2e/helpers/db.ts`; avoid direct hidden state mutations unless the helper already does it.
- Use existing Japanese UI text and `data-testid` selectors for browser assertions.

## Reset and Local State

- Playwright starts Wrangler with `.tmp-wrangler-state`, `.tmp-xdg-config`, and the guarded E2E reset token.
- Treat `.tmp-*`, `test-results`, and `playwright-report` as local artifacts.
- Do not weaken `src/routes/api/__test/reset/+server.ts` token guards to make tests easier.

## Command Selection

- `pnpm test:unit` for pure/domain/service/controller utility changes.
- `pnpm test:integration` for API route, service, repository, validation, and D1 fake changes.
- `pnpm test:e2e` for browser-visible dashboard workflows.
- `pnpm test:coverage` is a visibility check for server/API changes, not a required CI gate.
