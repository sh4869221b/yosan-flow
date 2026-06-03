# Superpowers Docs Agent Notes

## Scope

Applies to `docs/superpowers/**`.

## Purpose

- `specs/` records product and behavior design.
- `plans/` records implementation plans and verification notes.
- Behavior changes should remain traceable from spec or plan to implementation and tests.

## Writing Rules

- Product-facing and planning prose may be Japanese.
- Keep plans concrete: impacted files, expected behavior, verification commands, and rollout risks.
- Do not let docs introduce month-first assumptions that are not reflected in code.
- When updating an old plan, clearly distinguish completed historical notes from new follow-up work.

## Repository Contracts To Preserve

- Budget periods are the source of truth and can cross month boundaries.
- Period-owned daily totals and operation histories require `budget_period_id`.
- Same-day spending does not recalculate today's bonus/adjustment.
- Cloudflare preview/production deploys use environment-specific scripts, never bare `wrangler deploy`.

## Verification

- For docs-only edits, `pnpm format:check` is usually enough.
- For behavior changes documented here, also run the implementation-level checks named in the plan.
