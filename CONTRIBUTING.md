# Contributing

## Setup

Requirements:

- Node.js 20 or newer
- pnpm 9 or newer
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

Run focused checks while developing. Before merging a user-facing or data-model change, prefer:

```bash
pnpm check
pnpm test:unit
pnpm test:integration
pnpm build
pnpm test:e2e
```

For migration work:

```bash
pnpm run cf:migrate:local
```

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
