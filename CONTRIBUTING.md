# Contributing

## Setup

Requirements:

- Node.js 24.15 or newer
- pnpm 10.33.3 or newer
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
```

Required CI gate policy:

- Pull request / `main` push required order: `pnpm format:check` → `pnpm lint` → `pnpm check` → `pnpm test:unit` → `pnpm test:integration` → `pnpm build`
- Renovate branches use the same gate on `renovate/**` pushes. Keep this trigger in place because Renovate waits for successful branch CI before opening stable patch/minor PRs.
- E2E is intentionally not a required PR gate yet. Run `pnpm test:e2e` manually when browser workflows change, or dispatch the optional `E2E` GitHub Actions workflow.
- Coverage is intentionally a visibility check, not a required PR gate. Run `pnpm test:coverage` when changing server-side domain, API, repository, or validation behavior.

## Dependency Updates

Renovate is configured by `renovate.json`.

- The Dependency Dashboard Issue is enabled for visibility and manual approval.
- Stable patch/minor updates use `prCreation: "status-success"` so PRs are opened only after CI succeeds on the Renovate branch.
- Major updates, current `0.x` dependencies, and core dependencies require Dependency Dashboard approval before Renovate creates the branch or PR.
- Core dependencies are framework/runtime/deployment/database/UI and quality-gate dependencies that can change app behavior, build output, Cloudflare deployment, DB access, or the main dashboard component surface.

Run E2E separately when a change affects browser workflows:

```bash
pnpm test:e2e
```

Playwright starts the local Wrangler server once per run and resets D1 state before each test through a guarded E2E-only endpoint.

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
- Generated Drizzle migrations are not adopted yet.
- Generated Drizzle migration checks / drift checks are not required yet. For now, `pnpm check` type/import checks are the expected guard.

If E2E needs an in-memory dev server because local D1 state is stale, start the app with:

```bash
XDG_CONFIG_HOME=/home/sh4869/ghq/github.com/sh4869221b/yosan-flow/.tmp-xdg-config YOSAN_FLOW_FORCE_IN_MEMORY_DEV=1 pnpm dev -- --host 127.0.0.1
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
