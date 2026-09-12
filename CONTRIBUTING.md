# Contributing

## Setup

Requirements:

- Node.js: use the version specified in [.node_version](.node_version).
- pnpm: use the exact version specified by `packageManager` in [package.json](package.json).
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

## Development Guidelines

- Keep the period-first budget model as the default design. Do not add month-first compatibility paths unless explicitly requested.
- Keep the main dashboard optimized for quickly understanding today's allowance, today's usage, today's remaining amount, and the current period state.
- Use existing repository patterns before introducing new abstractions.
- Update relevant user-facing documentation when behavior changes.
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

### E2E timing and baseline

Both CI and the manual E2E workflow publish an **E2E timing summary** after the E2E job completes. Open the workflow run's summary or the `Summarize completed E2E job` log for timing, outcome counts and the five slowest individual tests.

- **Job** is the completed E2E job's `completed_at - started_at`, excluding queue time and the dependent summary job. It includes the measurement upload.
- **E2E step** is the existing `pnpm test:e2e` step interval. Every other completed step has its own interval; their sum need not equal job wall-clock.
- **Startup** is build start to Playwright's HTTP-ready observation. It includes build, D1 migrations, server startup, HTTP detection and the handoff to global setup.
- **Playwright** is the JSON report's `stats.duration`. **Attempts** sums every individual test/project entry's attempt durations, including retries. The top five rank those individual entries by their summed durations.
- Counts use final report outcomes: expected, unexpected/failed, flaky and skipped. A test that passes after a failed attempt is flaky, not an additional failed test.

All durations are reported in seconds. These measurements overlap and must not be added together. Missing test reports or incomplete startup produce `Unavailable`, while valid zero-test reports remain zero. Collection or malformed-data errors fail the summary job without changing the E2E job's result. Ordinary failures retain the existing JSON/HTML/Wrangler diagnostics; the timing artifact contains only `test-results/results.json` and `.tmp-e2e-timing.json`. Both artifact types have seven-day retention. A forcibly cancelled workflow may not publish them.

The following pre-optimization baseline was collected sequentially on 2026-09-12 from the manual workflow on `codex/issue-339-e2e-timing`, frozen at [`cd14999`](https://github.com/sh4869221b/yosan-flow/commit/cd14999). All five attempted runs and their summary jobs succeeded on attempt 1, with no failed runs, reruns or exclusions. Each ran the same 112 tests with one worker and unchanged Playwright startup, retry, reset and diagnostic settings. Every run reported 112 expected, 0 failed, 0 flaky and 0 skipped. Runtime/dependency versions are defined by `.node_version`, `package.json#packageManager` and `pnpm-lock.yaml` at that revision.

| Run / top-five summary                                                                                                                                                           | Attempt | Tests | Job (s) | E2E step (s) | Startup (s) | Playwright (s) | Attempts (s) |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------: | ----: | ------: | -----------: | ----------: | -------------: | -----------: |
| [34678769143](https://github.com/sh4869221b/yosan-flow/actions/runs/34678769143) / [summary](https://github.com/sh4869221b/yosan-flow/actions/runs/34678769143/job/103513865937) |       1 |   112 |     272 |          212 |      21.155 |        208.740 |      182.858 |
| [34679019837](https://github.com/sh4869221b/yosan-flow/actions/runs/34679019837) / [summary](https://github.com/sh4869221b/yosan-flow/actions/runs/34679019837/job/103514518245) |       1 |   112 |     253 |          208 |      21.862 |        205.759 |      180.392 |
| [34679264375](https://github.com/sh4869221b/yosan-flow/actions/runs/34679264375) / [summary](https://github.com/sh4869221b/yosan-flow/actions/runs/34679264375/job/103515128269) |       1 |   112 |     226 |          178 |      14.689 |        176.194 |      157.687 |
| [34679478967](https://github.com/sh4869221b/yosan-flow/actions/runs/34679478967) / [summary](https://github.com/sh4869221b/yosan-flow/actions/runs/34679478967/job/103515797585) |       1 |   112 |     246 |          205 |      21.252 |        202.727 |      177.972 |
| [34679722298](https://github.com/sh4869221b/yosan-flow/actions/runs/34679722298) / [summary](https://github.com/sh4869221b/yosan-flow/actions/runs/34679722298/job/103516476556) |       1 |   112 |     248 |          201 |      20.508 |        199.109 |      175.201 |
| **Median**                                                                                                                                                                       |         |       | **248** |      **205** |  **21.155** |    **202.727** |  **177.972** |

The median is the third sorted observation for each metric, computed before rounding. Remaining E2E job step intervals below use runs 1–5 in the same order as above; `Run E2E tests` is already listed in the main table.

| Step (seconds)                   | Run 1 | Run 2 | Run 3 | Run 4 | Run 5 | Median |
| -------------------------------- | ----: | ----: | ----: | ----: | ----: | -----: |
| Set up job                       |     1 |     1 |     2 |     1 |     2 |      1 |
| Check out repository             |     1 |     1 |     1 |     1 |     1 |      1 |
| Set up pnpm                      |     9 |     5 |     8 |     5 |     5 |      5 |
| Set up Node.js                   |    10 |     9 |     7 |     8 |     9 |      9 |
| Install dependencies             |     3 |     3 |     3 |     3 |     3 |      3 |
| Install Playwright browser       |    30 |    22 |    24 |    19 |    22 |     22 |
| Upload E2E diagnostics (skipped) |     0 |     0 |     0 |     0 |     0 |      0 |
| Upload E2E timing                |     1 |     1 |     1 |     1 |     1 |      1 |
| Post Set up Node.js              |     0 |     0 |     0 |     0 |     1 |      0 |
| Post Set up pnpm                 |     0 |     0 |     0 |     0 |     0 |      0 |
| Post Check out repository        |     1 |     0 |     0 |     1 |     0 |      0 |
| Complete job                     |     0 |     0 |     0 |     0 |     0 |      0 |

For historical context, these successful main CI runs predate instrumentation. Their test counts differ, so this heterogeneous sample is unsuitable for a controlled speedup comparison. Historical startup and full JSON measurements are unavailable; the old job duration also excludes the new measurement upload.

| Historical run                                                                   | Tests | Job (s) | E2E step (s) |
| -------------------------------------------------------------------------------- | ----: | ------: | -----------: |
| [34676579279](https://github.com/sh4869221b/yosan-flow/actions/runs/34676579279) |   112 |     241 |          199 |
| [34674096987](https://github.com/sh4869221b/yosan-flow/actions/runs/34674096987) |   110 |     234 |          187 |
| [34671516626](https://github.com/sh4869221b/yosan-flow/actions/runs/34671516626) |   107 |     278 |          218 |
| [34656281461](https://github.com/sh4869221b/yosan-flow/actions/runs/34656281461) |    97 |     230 |          175 |
| [34653021763](https://github.com/sh4869221b/yosan-flow/actions/runs/34653021763) |    87 |     182 |          143 |
| **Median**                                                                       | mixed | **234** |      **187** |

## Dependency Updates

Renovate is configured by `renovate.json`.

- The Dependency Dashboard Issue is enabled for visibility and manual approval.
- npm package updates wait until the released version is at least 3 days old before Renovate creates an update branch or PR. `pnpm-workspace.yaml` also enforces the same 3-day minimum release age for direct and transitive dependencies during install.
- A Renovate-only formatting workflow runs `pnpm install --frozen-lockfile` and `pnpm format` on Renovate PR branches, then commits formatter changes back to the PR branch when dependency updates change formatter output.
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
