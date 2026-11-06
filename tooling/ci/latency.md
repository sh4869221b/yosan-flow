# CI latency investigation (2026-11-06)

Implementation starts from main `75a5a8df0ac7e1f5881806a9101dc88134ac2a50`.
No checks, test cases, assertions, retries, timeouts for tests, branch protection,
Cloudflare settings or credentials are changed. Both E2E shards retain one worker,
separate D1 state and their existing required check names. No application build
output or Docker image archive is cached/shared.

## Observed hosted execution

These are five consecutive successful CI runs, not a controlled before/after
experiment. The first three ran 179 E2E tests; the last two ran 185. Each reported
zero failed/flaky/skipped cases. Queue time before the first job is excluded;
scheduler gaps before Quality are included. Times are seconds.

| Run                                                                              | First job → Quality complete | E2E job 1 / 2 | Test attempts 1 / 2 | Font/image RUN step 1 / 2 |
| -------------------------------------------------------------------------------- | ---------------------------: | ------------: | ------------------: | ------------------------: |
| [42129907630](https://github.com/sh4869221b/yosan-flow/actions/runs/42129907630) |                          257 |     213 / 169 |    122.753 / 66.726 |                10.5 / 8.8 |
| [42131709348](https://github.com/sh4869221b/yosan-flow/actions/runs/42131709348) |                          233 |     213 / 143 |    122.711 / 51.200 |                5.2 / 14.0 |
| [42134009025](https://github.com/sh4869221b/yosan-flow/actions/runs/42134009025) |                          217 |     195 / 149 |    106.844 / 65.127 |                 7.1 / 5.0 |
| [42136423466](https://github.com/sh4869221b/yosan-flow/actions/runs/42136423466) |                          208 |     188 / 142 |     97.820 / 64.804 |                 6.0 / 5.5 |
| [42138585990](https://github.com/sh4869221b/yosan-flow/actions/runs/42138585990) |                          229 |     211 / 151 |    118.533 / 68.933 |                12.8 / 5.4 |

The median first-job-to-Quality duration is **229 seconds**. Non-E2E required jobs
finished 62–77 seconds after the first job; E2E determined completion in all five.
The latest classifier took 10 seconds, E2E setup/pnpm-cache restore took about
9–11 seconds, and image pulls took roughly 25–34 seconds. The ten font/image RUN
steps had a median of 6.55 seconds; they include index retrieval, package download,
installation and Node/fontconfig setup. These overlapping intervals are not added.

The tail is substantially worse than the success sample:

- [Failed job 127603085385](https://github.com/sh4869221b/yosan-flow/actions/runs/42129729849/job/127603085385)
  spent **596.2 seconds** in the Docker RUN before failing on the 61.2 MB Japanese
  font download from `azure.archive.ubuntu.com`. APT index retrieval took 2.175
  seconds. The font was requested at 4.405 seconds, retried repeatedly, and failed
  with a closed connection. No browser tests ran on that shard.
- [Cancelled job 127603369598](https://github.com/sh4869221b/yosan-flow/actions/runs/42129804400/job/127603369598)
  lasted **1,219 seconds**, also stalled while retrieving the font, and produced
  no Playwright report. It is not a successful timing sample.

Sources are the Actions jobs timestamps, BuildKit log timestamps and the existing
E2E timing summary logs. Direct artifact downloads in this environment returned
403; the logs supplied the observed timings/outcomes above.

## Changes and expected effect

- Cache only the fixed 61,229,778-byte Ubuntu font package, separately from pnpm.
  Verify size/SHA-256 on every read and again in the Docker build; verify the
  Debian package name/version before installation. The font, browser and FFmpeg
  smoke checks still run. A corrupted restored package fails closed.
- Download a cache miss from the official HTTPS archive, then its official Azure
  mirror if needed. Each attempt is bounded to 60 seconds including the body.
  Download overlaps the existing image pulls. The Docker build installs the
  verified local package and no longer downloads APT indexes or fonts.
- Reuse the pnpm content store across lockfile changes with the same Node,
  install policy, OS and architecture. Every run still performs the frozen
  install and the existing integrity/release-age/supply-chain checks. Font and
  Dockerfile changes no longer invalidate the entire dependency store.
- Preserve the caller's Docker CLI configuration, including its proxy/registry
  selection. It is not copied into the build context or mounted in the runner.

The main expected gain is avoiding the observed 10–20-minute font-download tail.
Normal successful runs should save part of the APT/download time, minus the new
61 MB cache transfer and local copy/hash costs. **No hosted speedup percentage is
claimed**: Actions cache hit/miss and cold/warm timings must be measured after a
reviewed branch is run. Initial v2 pnpm keys will be cold.

Local cloud measurements used the repository Node/pnpm versions and the same
digest-pinned Playwright/Node images. Initial font acquisition took **4.986 s**;
verified local-cache reuse took **0.209 s**. This excludes Actions cache transport
and is not a CI wall-clock comparison. The container's font-install RUN took
**4.7 s** on the local `vfs` Docker driver, which differs from hosted runners.

## Pin provenance and maintenance

`font.json` is the same `fonts-noto-cjk` version previously installed by APT.
On 2026-11-06, the following chain was verified:

1. [Official Ubuntu archive keyring](https://archive.ubuntu.com/ubuntu/project/ubuntu-archive-keyring.gpg)
   verifies [Noble InRelease](https://archive.ubuntu.com/ubuntu/dists/noble/InRelease),
   signed by the Ubuntu Archive Automatic Signing Key (2018), fingerprint
   `F6ECB3762474EDA9D21B7022871920D1991BC93C`.
2. InRelease's SHA-256 for `main/binary-amd64/Packages.xz` matches
   `2a6a199e1031a5c279cb346646d594993f35b1c03dd4a82aaa0323980dd92451`.
3. That index's `fonts-noto-cjk` stanza provides the version, filename, size and
   SHA-256 recorded in `container/font.json`.

The checked-in hash carries that content identity into future runs; it does not
represent fresh APT-signature validation on every run. Update the pin only after
repeating this chain, reviewing the change and rerunning smoke/E2E. Neither an
unverified mirror response nor a cache entry can change the accepted bytes.

## Further work and limits

The latest two runs have a 33.016 / 49.600-second difference between shard test
attempt totals. Perfect balancing at the same speeds would save at most about
16.5 / 24.8 seconds in a simple model, before overhead and runner variation.
This is an estimate, not a measured achievable gain. No single test dominates
(the integrated journey takes about 5–6 seconds per viewport). Shard partitioning
needs a stable repeated baseline before adding duration-based routing or more
runners; one shared D1 must never gain concurrent workers.

Build artifact transfer was previously investigated in #343/#416 and not adopted;
the independent Build check and each shard's verified build remain. The expensive
image archive cache rejected in #527 (roughly 124 seconds to save and 34–48 seconds
to restore) is not reintroduced. Official base image pulls, per-shard build/smoke,
classification and scheduler time remain.

## Validation

Repository-defined Node 26.13.0 / pnpm 12.16.1 were used. Formatting, lint with
zero warnings, Svelte/TypeScript checking with zero errors/warnings, Fallow with
unchanged baselines, unit tests (772), integration tests (115), migration safety
(51), and the production build passed. Actionlint 1.7.12 validated both workflows
(ShellCheck was unavailable); `bash -n` and wrapper behavior tests passed.

New negative controls reject corrupt cache bytes and unverified mirror responses
before installation, and prevent image build/test execution after font failure.
Wrapper tests preserve literal Playwright arguments and exclude cloud/app secrets.
The frozen dependency installation, browser/font/video smoke and reset contracts
are exercised through the standard container entry point.

Both local container shards passed: **95 + 90 = 185 tests**, zero failed, flaky or
skipped, with one passing attempt each. Their file/location/title/project tuples
are disjoint and their union exactly matches the full Playwright test inventory.
The first run built the derived image and reused a verified font; the second
reused that local image. Local dependency policy requests incurred roughly
30-second registry delays, so whole-run durations are not comparable to hosted
CI. These runs validate execution/coverage, not a hosted speedup claim.

Local setup needed a writable `BUILDX_CONFIG` because the environment's default
home directory is read-only, and the provided SQLite executable on PATH for the
SQL integration tests. These are verification-environment settings, not repository
changes. During local validation, the attempted CI-only build correctly rejected
the uncommitted checkout at `git diff --quiet HEAD --`; that guard was not bypassed
or weakened. A clean-commit GitHub CI run and hosted cache timings must be tracked
separately in the pull request. The measurements above are the pre-PR evidence;
they do not establish the change's hosted speedup.
