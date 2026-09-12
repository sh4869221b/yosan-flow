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

Both CI and the manual E2E workflow run shards `1/2` and `2/2` on independent hosted runners, with one Playwright worker and runner-local Wrangler/D1 state per shard. `fail-fast: false` lets the other shard finish after a failure, and `Quality checks` requires both CI shards to succeed. The **E2E timing summary** runs after both shards complete and publishes a separate section for each shard. Open the workflow run's summary or the `Summarize completed E2E job` log for timing, outcome counts and the five slowest individual tests in each shard.

- **Job** is the completed E2E job's `completed_at - started_at`, excluding queue time and the dependent summary job. It includes the measurement upload.
- **E2E step** is the existing `pnpm test:e2e` step interval. Every other completed step has its own interval; their sum need not equal job wall-clock.
- **Startup** is build start to Playwright's HTTP-ready observation. It includes build, D1 migrations, server startup, HTTP detection and the handoff to global setup.
- **Playwright** is the JSON report's `stats.duration`. **Attempts** sums every individual test/project entry's attempt durations, including retries. The top five rank those individual entries by their summed durations.
- Counts use final report outcomes: expected, unexpected/failed, flaky and skipped. A test that passes after a failed attempt is flaky, not an additional failed test.

All durations are reported in seconds. These measurements overlap and must not be added together. Missing test reports or incomplete startup produce `Unavailable`, while valid zero-test reports remain zero. Collection or malformed-data errors fail the summary job without changing the E2E job's result, after allowing the other shard's summary to run. Ordinary failures retain the existing JSON/HTML/Wrangler diagnostics; the timing artifact contains only `test-results/results.json` and `.tmp-e2e-timing.json`. Artifact names include the run ID, attempt and `-shard-1` or `-shard-2`; each shard is downloaded into its own directory. Both artifact types have seven-day retention. A forcibly cancelled workflow may not publish them.

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

#### Per-test warm-up removal (#340)

The following ten sequential manual E2E runs were collected on 2026-09-12 from `codex/issue-340-remove-e2e-warmup`, frozen at implementation revision [`6bb3b48`](https://github.com/sh4869221b/yosan-flow/commit/6bb3b48). They use the same 112-test suite, `ubuntu-latest` runner label, one worker, dependency definitions and startup/retry/reset/diagnostic settings as the #339 baseline above. The implementation removes the separate-page warm-up and its fixed 500ms wait before each test. This measurement record was added afterward in a documentation-only commit; no implementation, test, configuration or dependency changes occurred during the sequence.

All ten attempted hosted runs and their summary jobs succeeded on attempt 1: each reported 112 expected, 0 failed, 0 flaky and 0 skipped, with no test retries, failed runs, reruns or exclusions. Dispatching paused for about 2.5 hours between runs 5 and 6 because of an agent usage limit; no workflow was interrupted. Every run's first test, `updates a seeded period budget`, passed. Each run also logged 116 database resets, all with zero rows afterward in `budgetPeriods`, `dailyOperationHistories` and `dailyTotals`, including resets with nonzero rows beforehand in all three tables.

| Run / top-five summary                                                                                                                                                           | Attempt | Tests | Job (s) | E2E step (s) | Startup (s) | Playwright (s) | Attempts (s) |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------: | ----: | ------: | -----------: | ----------: | -------------: | -----------: |
| [34681246460](https://github.com/sh4869221b/yosan-flow/actions/runs/34681246460) / [summary](https://github.com/sh4869221b/yosan-flow/actions/runs/34681246460/job/103520504221) |       1 |   112 |     178 |          136 |      20.885 |        133.753 |      109.467 |
| [34681433950](https://github.com/sh4869221b/yosan-flow/actions/runs/34681433950) / [summary](https://github.com/sh4869221b/yosan-flow/actions/runs/34681433950/job/103521002533) |       1 |   112 |     179 |          127 |      16.028 |        124.675 |      104.605 |
| [34681604777](https://github.com/sh4869221b/yosan-flow/actions/runs/34681604777) / [summary](https://github.com/sh4869221b/yosan-flow/actions/runs/34681604777/job/103521478106) |       1 |   112 |     182 |          135 |      20.483 |        133.100 |      109.331 |
| [34681784095](https://github.com/sh4869221b/yosan-flow/actions/runs/34681784095) / [summary](https://github.com/sh4869221b/yosan-flow/actions/runs/34681784095/job/103521947444) |       1 |   112 |     182 |          134 |      20.613 |        131.636 |      107.752 |
| [34681953797](https://github.com/sh4869221b/yosan-flow/actions/runs/34681953797) / [summary](https://github.com/sh4869221b/yosan-flow/actions/runs/34681953797/job/103522448690) |       1 |   112 |     196 |          142 |      20.880 |        139.537 |      115.391 |
| [34688332655](https://github.com/sh4869221b/yosan-flow/actions/runs/34688332655) / [summary](https://github.com/sh4869221b/yosan-flow/actions/runs/34688332655/job/103539451364) |       1 |   112 |     160 |          117 |      15.873 |        115.484 |       97.011 |
| [34688535031](https://github.com/sh4869221b/yosan-flow/actions/runs/34688535031) / [summary](https://github.com/sh4869221b/yosan-flow/actions/runs/34688535031/job/103540005506) |       1 |   112 |     172 |          133 |      19.824 |        130.368 |      107.289 |
| [34688721765](https://github.com/sh4869221b/yosan-flow/actions/runs/34688721765) / [summary](https://github.com/sh4869221b/yosan-flow/actions/runs/34688721765/job/103540475502) |       1 |   112 |     170 |          119 |      16.841 |        117.657 |       96.979 |
| [34688895903](https://github.com/sh4869221b/yosan-flow/actions/runs/34688895903) / [summary](https://github.com/sh4869221b/yosan-flow/actions/runs/34688895903/job/103540923152) |       1 |   112 |     176 |          137 |      20.836 |        133.717 |      109.548 |
| [34689063054](https://github.com/sh4869221b/yosan-flow/actions/runs/34689063054) / [summary](https://github.com/sh4869221b/yosan-flow/actions/runs/34689063054/job/103541379821) |       1 |   112 |     190 |          141 |      21.149 |        138.953 |      113.319 |

Each candidate median averages the fifth and sixth sorted raw observations before rounding. Differences use `candidate median - baseline median` and `(candidate median / baseline median - 1) * 100`; negative values mean faster. Values below are rounded to three decimal places.

| Metric     | #339 baseline median (s) | #340 median (s) | Difference (s) | Difference (%) |
| ---------- | -----------------------: | --------------: | -------------: | -------------: |
| Job        |                  248.000 |         178.500 |        -69.500 |        -28.024 |
| E2E step   |                  205.000 |         134.500 |        -70.500 |        -34.390 |
| Startup    |                   21.155 |          20.548 |         -0.607 |         -2.869 |
| Playwright |                  202.727 |         132.368 |        -70.359 |        -34.706 |
| Attempts   |                  177.972 |         108.542 |        -69.431 |        -39.012 |

The measured E2E step median decreased by 70.5 seconds. Hosted-runner variation and the dispatch pause limit attribution of the entire difference to warm-up removal. The overlapping metrics remain separate; these results do not establish the parent epic's overall performance target.

#### Two isolated shards (#341)

Five consecutive manual workflow attempts were dispatched sequentially on 2026-09-12 from `codex/issue-341-e2e-two-shards`, fixed at [`d23fb85`](https://github.com/sh4869221b/yosan-flow/commit/d23fb85). All five attempts and their summary jobs succeeded on attempt 1, without retries, reruns, exclusions or changes during the series. The later documentation commit leaves the measured implementation unchanged. Runtime/dependency versions remain defined by `.node_version`, `package.json#packageManager` and `pnpm-lock.yaml` at that revision.

Every actual report's file, full test title and project tuples matched its assigned inventory: shard 1 ran 58 tests and shard 2 ran 54, with no overlap and a union equal to the complete 112-test inventory. Each shard used one worker with `fullyParallel: false`. All results were expected, with 0 failed, flaky or skipped tests and one successful attempt per test. Distinct runner IDs, separate build logs and startup timing confirm independent execution of the unchanged build/migration/server sequence. Each run logged 58 D1 resets per shard (116 total), all with zero rows afterward in `budgetPeriods`, `dailyOperationHistories` and `dailyTotals`; 56/57 resets respectively had nonempty tables beforehand.

**Job envelope** is the latest shard job completion minus the earliest shard job start, excluding queue time and the summary job. **E2E step envelope** uses the same calculation on the two `Run E2E tests` steps. **Start skew** is the difference between their start timestamps. Neither envelope sums shard durations or overlapping startup/Playwright measurements.

| Run / per-shard top-five summary                                                                                                                                                 | Attempt | Job envelope (s) | E2E step envelope (s) | Job start skew (s) | E2E step start skew (s) |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------: | ---------------: | --------------------: | -----------------: | ----------------------: |
| [34691034561](https://github.com/sh4869221b/yosan-flow/actions/runs/34691034561) / [summary](https://github.com/sh4869221b/yosan-flow/actions/runs/34691034561/job/103546459391) |       1 |              144 |                   103 |                  0 |                      12 |
| [34691177405](https://github.com/sh4869221b/yosan-flow/actions/runs/34691177405) / [summary](https://github.com/sh4869221b/yosan-flow/actions/runs/34691177405/job/103546899283) |       1 |              157 |                   114 |                  1 |                      33 |
| [34691338220](https://github.com/sh4869221b/yosan-flow/actions/runs/34691338220) / [summary](https://github.com/sh4869221b/yosan-flow/actions/runs/34691338220/job/103547267091) |       1 |              135 |                    93 |                  1 |                      23 |
| [34691504391](https://github.com/sh4869221b/yosan-flow/actions/runs/34691504391) / [summary](https://github.com/sh4869221b/yosan-flow/actions/runs/34691504391/job/103547695852) |       1 |              128 |                    85 |                  0 |                       4 |
| [34691666870](https://github.com/sh4869221b/yosan-flow/actions/runs/34691666870) / [summary](https://github.com/sh4869221b/yosan-flow/actions/runs/34691666870/job/103548144698) |       1 |              134 |                    84 |                  0 |                       1 |

The following per-shard values use the same run order. Outcomes are `expected / failed / flaky / skipped`; all durations are seconds, rounded only for display.

| Run | Shard | Outcomes       | Job (s) | E2E step (s) | Startup (s) | Playwright (s) | Attempts (s) |
| --: | ----: | -------------- | ------: | -----------: | ----------: | -------------: | -----------: |
|   1 |   1/2 | 58 / 0 / 0 / 0 |     144 |           91 |      18.178 |         89.303 |       67.577 |
|   1 |   2/2 | 54 / 0 / 0 / 0 |     124 |           83 |      21.204 |         80.928 |       57.264 |
|   2 |   1/2 | 58 / 0 / 0 / 0 |     116 |           73 |      17.720 |         70.644 |       50.641 |
|   2 |   2/2 | 54 / 0 / 0 / 0 |     157 |           81 |      20.562 |         79.264 |       56.314 |
|   3 |   1/2 | 58 / 0 / 0 / 0 |     134 |           70 |      15.793 |         68.459 |       48.854 |
|   3 |   2/2 | 54 / 0 / 0 / 0 |     123 |           82 |      20.682 |         79.691 |       56.586 |
|   4 |   1/2 | 58 / 0 / 0 / 0 |     128 |           81 |      20.475 |         78.373 |       53.758 |
|   4 |   2/2 | 54 / 0 / 0 / 0 |     122 |           81 |      20.531 |         78.077 |       55.127 |
|   5 |   1/2 | 58 / 0 / 0 / 0 |     131 |           80 |      20.553 |         78.370 |       54.697 |
|   5 |   2/2 | 54 / 0 / 0 / 0 |     134 |           84 |      21.096 |         81.351 |       57.804 |

Each five-run envelope median is the third sorted raw observation. Differences use `candidate - baseline` and `(candidate / baseline - 1) * 100`, rounded to three decimals after calculation. The #340 baseline used one runner, so its job and step durations correspond to the candidate envelopes.

| Metric   | #340 baseline median (s) | #341 envelope median (s) | Difference (s) | Difference (%) |
| -------- | -----------------------: | -----------------------: | -------------: | -------------: |
| Job      |                  178.500 |                  135.000 |        -43.500 |        -24.370 |
| E2E step |                  134.500 |                   93.000 |        -41.500 |        -30.855 |

Both measured medians improved, with no observed failures or retries in this five-run sample. Hosted-runner variability remains visible: job starts differed by at most one second, while E2E step starts differed by up to 33 seconds after setup. Both runners independently pay installation, build, migration and startup costs, so lower elapsed time does not imply lower total runner usage. These observations do not establish the parent epic's overall target or justify spec balancing or build reuse by themselves.

Failure handling was checked separately before measurement: [fault CI 34690734637](https://github.com/sh4869221b/yosan-flow/actions/runs/34690734637) deliberately exited 1 only in shard 1 after its 58 tests passed. Shard 2 completed all 54 tests, both timing artifacts and summary sections were produced, shard 1 uploaded JSON/HTML/Wrangler diagnostics, and `Quality checks` failed. This synthetic step failure did not generate a test-failure trace. The injection was then removed through an ordinary commit; [restored CI 34690902845](https://github.com/sh4869221b/yosan-flow/actions/runs/34690902845) passed both shards, the summary and all required quality checks. Neither CI run belongs to the five-run sample.

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
