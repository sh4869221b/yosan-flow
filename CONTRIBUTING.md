# Contributing

## Setup

Requirements:

- Node.js 24.15 or newer
- pnpm 10.33.4 or newer
- Cloudflare account for D1/Workers checks

Install dependencies and prepare local D1:

```bash
pnpm install
cp .dev.vars.example .dev.vars
pnpm run cf:migrate:local
```

Start the Vite development server:

```bash
pnpm dev
```

For Workers-like local execution, use Wrangler:

```bash
pnpm wrangler dev
```

When `wrangler.jsonc` bindings change, regenerate checked-in Worker types:

```bash
XDG_CONFIG_HOME="$PWD/.tmp-xdg-config" pnpm wrangler types
XDG_CONFIG_HOME="$PWD/.tmp-xdg-config" pnpm wrangler types worker-runtime.d.ts --include-env false
```

## Project Shape

- `src/routes/`: SvelteKit routes and server load logic.
- `src/lib/components/`: Svelte UI components.
- `src/lib/server/`: server-side repositories, services, and validation.
- `migrations/`: D1 schema migrations.
- `src/lib/server/db/schema.ts`: Drizzle schema mirror for the current SQL migrations.
- `tests/unit/`: domain and calculation tests.
- `tests/integration/`: API/repository integration tests.
- `tests/e2e/`: Playwright dashboard tests.
- `docs/superpowers/`: design specs and implementation plans.

## Development Guidelines

- Keep the period-first budget model as the default design. Do not add month-first compatibility paths unless explicitly requested.
- Keep the main dashboard optimized for quickly understanding today's allowance, today's usage, today's remaining amount, and the current period state.
- Use existing repository patterns before introducing new abstractions.
- Update docs/specs when behavior changes.
- Do not commit `.dev.vars`, `.env`, `.wrangler`, `.tmp-*`, `test-results`, or other local state.

## Verification

Format files before opening a review:

```bash
pnpm format
pnpm format:check
```

Lint source, test, and config files:

```bash
pnpm lint
```

Run focused checks while developing. CI runs the same quality baseline:

```bash
pnpm format:check
pnpm lint
pnpm check
pnpm test:unit
pnpm test:integration
pnpm build
pnpm test:e2e
```

Required CI gate policy:

- Pull request / `main` push CI runs `pnpm format:check`, `pnpm lint`, `pnpm check`, `pnpm test:unit`, `pnpm test:integration`, `pnpm build`, and `pnpm test:e2e`.
- CI executes independent checks in parallel, then reports the aggregate `Quality checks` job after all required jobs succeed.
- Renovate update branch pushes do not run CI directly. Renovate creates PRs immediately after any required Dependency Dashboard approval, and pull request CI is the authoritative validation gate.
- The optional `E2E` GitHub Actions workflow remains available through `workflow_dispatch` for manual Playwright checks.
- Coverage is intentionally a visibility check, not a required PR gate. Run `pnpm test:coverage` when changing server-side domain, API, repository, or validation behavior.

## Dependency Updates

Renovate is configured by `renovate.json`.

- The Dependency Dashboard Issue is enabled for visibility and manual approval.
- npm package updates wait until the released version is at least 3 days old before Renovate creates an update branch or PR. `pnpm-workspace.yaml` also enforces the same 3-day minimum release age for direct and transitive dependencies during install.
- Stable patch/minor updates use immediate PR creation, so CI runs on the pull request instead of a temporary Renovate branch.
- Major updates and current `0.x` dependencies require Dependency Dashboard approval before Renovate creates the branch or PR.
- Core dependencies still require Dependency Dashboard approval for major updates, but their patch/minor updates create PRs automatically after the 3-day release age gate.
- Core dependencies are framework/runtime/deployment/database/UI and quality-gate dependencies that can change app behavior, build output, Cloudflare deployment, DB access, or the main dashboard component surface.

Run E2E locally when a change affects browser workflows:

```bash
pnpm test:e2e
```

Playwright applies local D1 migrations before starting the local Wrangler server, then resets D1 data before each test through a guarded E2E-only endpoint.

Check unit/integration coverage for server and API code:

```bash
pnpm test:coverage
```

For migration work:

```bash
pnpm run cf:migrate:local
```

Migration policy:

- SQL files under `migrations/*.sql` remain the source of truth.
- The Drizzle schema is a mirror only at this stage.
- Non-migration application DB query paths should stay behind the Drizzle boundary and repositories. Runtime schema bootstrap is not part of the request path; apply migrations before using a D1-backed environment.
- Generated Drizzle migrations are not adopted yet.
- Generated Drizzle migration checks / drift checks are not required yet. For now, `pnpm check` type/import checks are the expected guard.

If E2E needs an in-memory dev server because local D1 state is stale, start the app with:

```bash
XDG_CONFIG_HOME="$PWD/.tmp-xdg-config" YOSAN_FLOW_FORCE_IN_MEMORY_DEV=1 pnpm dev -- --host 127.0.0.1
```

## Cloudflare Deployments

Do not deploy with bare `wrangler deploy`. The top-level D1 database id in `wrangler.jsonc` is a local placeholder.

Use environment-specific scripts:

```bash
pnpm run deploy:preview
pnpm run deploy:production
```

Before preview or production deploys, confirm the matching `env.preview` or `env.production` D1 `database_id` is not `00000000-0000-0000-0000-000000000000`.

## Commit Messages

Follow the style already used in the repository:

- `feat: short description`
- `fix: short description`
- `chore: short description`
- `docs: short description`

Keep commits focused and avoid mixing unrelated formatting changes with logic changes.
