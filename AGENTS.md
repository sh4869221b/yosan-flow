# AGENTS.md

## Scope

This file applies to the entire `yosan-flow` repository.

## Project Overview

- `yosan-flow` is a SvelteKit app deployed to Cloudflare Workers with D1.
- The product focus is not detailed household-account category analysis. Keep the main UX centered on making the current period budget and "how much can be spent today" easy to understand.
- The budget period model is the source of truth. Avoid reintroducing month-first behavior unless a task explicitly asks for it.

## Required Reading

Before making changes, read:

- `README.md`
- `CONTRIBUTING.md`
- Relevant specs/plans under `docs/superpowers/`

For behavior changes, update or confirm the relevant spec/plan first so the path remains traceable from spec to implementation to tests.

## Development Rules

- Keep diffs small and focused on the requested behavior.
- Use existing SvelteKit, Svelte 5, TypeScript, Vitest, Playwright, Wrangler, and Bits UI patterns already present in the repo.
- Do not add runtime dependencies without explicit user approval.
- Keep code comments and docs consistent with nearby files. This repository currently uses English in code and Japanese in product/docs where appropriate.
- Do not commit secrets or local runtime state. Treat `.env`, `.dev.vars`, `.wrangler`, `.tmp-*`, `test-results`, and Cloudflare credentials as sensitive/local artifacts.

## Domain Rules

- Budget periods use `start_date` and `end_date`; periods may cross month boundaries.
- `budget_period_id` is required for period-owned daily totals and operation histories.
- Old month/day update routes are intentionally not a compatibility surface. Prefer period API paths.
- Same-day spending must not recalculate today's bonus or adjustment. It is reflected as today's used/remaining amount, and then becomes part of pace calculation on the next day.
- Future period summaries should not show today's food allowance as available before the period starts.

## Cloudflare and D1

- The D1 binding name is `DB`.
- The top-level `wrangler.jsonc` D1 `database_id` is a local placeholder. Do not deploy with bare `wrangler deploy`.
- Deploy preview/production only with environment-specific scripts:
  - `pnpm run deploy:preview`
  - `pnpm run deploy:production`
- When deployment fails with a placeholder UUID or Cloudflare `code: 10181`, inspect `wrangler.jsonc` env blocks and the deploy command before changing application code.
- For local UI checks when D1 state is stale, prefer:

```bash
XDG_CONFIG_HOME="$PWD/.tmp-xdg-config" YOSAN_FLOW_FORCE_IN_MEMORY_DEV=1 pnpm dev -- --host 127.0.0.1
```

## Verification

Run the most relevant checks for the files changed. For broad behavior changes, use this order:

```bash
pnpm check
pnpm test:unit
pnpm test:integration
pnpm build
pnpm test:e2e
```

For D1 schema work, also run the relevant migration command:

```bash
pnpm run cf:migrate:local
```

If a command cannot be run, state that clearly and explain the remaining risk.

## Git Hygiene

- Follow the commit style already used in history, for example `feat: ...`, `fix: ...`, or `chore: ...`.
- Do not revert unrelated user changes.
- Keep generated and local runtime artifacts out of commits.
