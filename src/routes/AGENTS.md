# Routes Agent Notes

## Scope

Applies to `src/routes/**`.

## Route Map

- `+page.server.ts` loads periods, picks requested/current/latest period, and returns the dashboard summary.
- `+page.svelte` should stay a thin composition layer around the dashboard controller and components.
- `api/periods/+server.ts` lists and creates periods.
- `api/periods/[periodId]/+server.ts` reads/updates a period summary.
- `api/periods/[periodId]/days/[date]/add/+server.ts` appends spending for a period day.
- `api/periods/[periodId]/days/[date]/overwrite/+server.ts` replaces spending for a period day.
- `api/periods/[periodId]/days/[date]/history/**` reads, edits, and deletes operation histories.
- `api/__test/reset/+server.ts` is an E2E-only reset endpoint.

## Request Boundaries

- Prefer period API paths. Do not add old month/day compatibility routes unless explicitly requested.
- Parse `periodId`, `date`, `historyId`, and mutation bodies through `src/lib/server/validation/**`.
- Keep route handlers focused on parsing, calling services, and returning JSON. Domain decisions belong in `src/lib/server/**`.
- Return stable JSON shapes used by the dashboard controller and integration tests.
- Use `toApiErrorResponse` for validation/service failures so status codes and messages stay consistent.

## Test-Only Reset

- Keep `api/__test/reset` guarded by the E2E reset token and local/test intent.
- Do not expose reset behavior through normal app routes.
- When changing reset semantics, update Playwright helpers and E2E setup together.

## Verification

- API route changes usually need `pnpm test:integration`.
- Page load or dashboard wiring changes usually need `pnpm check` and focused Playwright coverage if browser behavior changes.
