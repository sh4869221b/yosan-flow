# Container E2E experiment (option 1)

This branch replaces Nix only in the two CI E2E shards and manual E2E workflow.
Development and other CI jobs retain their existing Node/pnpm setup. The application,
Playwright configuration, migration safety checks, reset token/local-intent guard,
test inventory, two shards, one worker, Quality aggregation, and seven-day diagnostics
are unchanged. No remote database, deployment, credentials, or publication is needed.

## Distribution and version contract

`container/image.json` pins the official Microsoft Artifact Registry Playwright
Ubuntu Noble image by readable tag **and linux/amd64 manifest digest**. It is
`mcr.microsoft.com/playwright:v1.63.0-noble` at
`sha256:bc6ab0d6d44ff4826e4cb8c1e6d801e185bfc42bb0753f8e2a30efc70db054c7`.
The base includes browsers, Playwright FFmpeg and their system dependencies, but
not the project npm package. See [official Playwright Docker documentation](https://playwright.dev/docs/docker).

Node's version is read from `.node_version`; the tag is assembled as
`docker.io/library/node:<version>-bookworm-slim`. The official Docker Node
linux/amd64 manifest is pinned separately by `nodeDigest` in `image.json`
(`sha256:51b1100cc2a83d370c6a60952e3f2989c8a43159d0e38586e090f3b3326efefd`
for this checkout). Only its Node executable is copied into Noble. The base's
Node version differs from the project version, so using its default is insufficient.
`e2e-container-prepare.ts` verifies the executable version against `.node_version`.

pnpm reuses `preparePnpm` from `scripts/pnpm-e2e.ts`: `package.json#packageManager`
and the package-manager lock document supply version and SHA-512 integrity for
both official npm registry archives. No second manual Node or pnpm version is
introduced. Dependency installation remains `pnpm install --frozen-lockfile`,
including the project's supply-chain/release-age/build policies.

Before building/loading an image, the configuration reader extracts the root
importer's **resolved** `@playwright/test` version from the application document
of `pnpm-lock.yaml`, checks locked package entries and rejects an incompatible
image tag or unsupported/ambiguous lock layout. The smoke test then checks the
installed test, Playwright and core versions, browser revision and actual browser
version, matching FFmpeg revision/executable and a real recorded video. It checks
Japanese font selection and saves a Japanese screenshot. Noto CJK comes from
signed official Ubuntu Noble APT metadata at an exact package version in the
Dockerfile. A scoped fontconfig selects Noto CJK/DejaVu instead of the base image's
Chinese font preference. No browser executable override or launch-policy change is used.

A digest fixes content identity; it does **not** authenticate a publisher or provide
the same guarantee as the existing Nix closure signature checks. This prototype
trusts the official registries over TLS and Ubuntu's APT signatures, plus the
committed npm integrity pins. It does not verify an OCI publisher signature or
attestation. The derived image ID is recorded, but is built locally rather than
being independently digest-pinned in a published registry. APT metadata can change
between builds; the font version is pinned, not the full APT repository snapshot.
The Actions image archive is a branch-scoped cache, not a new authenticity proof.

## Updating

When Renovate changes Playwright, resolve the updated lockfile first. Inspect the
matching official `v<resolved-version>-noble` manifest, review its linux/amd64 digest,
and update `image.json`; a dependency-only change fails closed until reviewed.
When `.node_version` changes, inspect the corresponding official Node tag, update
`nodeDigest` and verify the resulting binary. A same-version upstream image rebuild
also requires reviewing and updating the digest. Changing font packages or Ubuntu
requires an explicit Dockerfile review and new smoke checks. No automatic fallback
to `latest`, mismatched browsers, host tools, or unsigned Nix replacement is used.

## Execution and cache

```bash
bash scripts/e2e-container.sh 1
bash scripts/e2e-container.sh 2
```

Run shards sequentially locally, or in independent checkouts/runners. The single
`docker run` per shard installs dependencies, smokes the browser/fonts/FFmpeg,
builds, verifies and tests at `/work/yosan-flow`. Playwright still clears its
own disposable local D1 state, migrates and launches Wrangler with its existing
reset/local guard. In Actions the existing guarded `e2e-build.ts build` and
`YOSAN_FLOW_E2E_PREBUILT=1` path are used inside that same container and path.
Local runs retain the normal Playwright build path. Linked worktrees mount their
existing external Git metadata read-only for the identity verifier. The previous parallel
browser/build preparation becomes serial smoke/build; this trades overlap for a
simple persistent-container identity. No manifest guard is relaxed.

The Docker build context contains only Dockerfile and fonts.conf. The checkout
mount is writable for generated output; use a dedicated clean checkout without
local environment/credential files. CI identity is explicitly allowlisted; cloud
credentials are not forwarded. The process uses the caller UID/GID, `--init`,
private IPC and `--shm-size=1g`. No privileged mode, added capabilities, sysctl,
Docker daemon reconfiguration or security-policy change is required. If Docker
is unavailable or cannot execute, stop rather than altering host permissions.

Actions restores a compressed derived-image tar archive using an exact key covering image
configuration, Dockerfile, fonts and Node definition; the script loads it, records
the final image ID and atomically saves a missing archive after successful tests before returning. The exact pnpm
store key also covers the dependency lock. Both shards own their state. Missing
or unusable archives, unavailable registries or failing verification are errors.
The image key is identical locally and in CI; installed Node/browser smoke checks
still run on a cache hit. Large image cache restore/save overhead remains part of
the E2E job, and could offset setup savings.

Timing records under `.tmp-container-e2e/*-timing.json` cover bootstrap, dependency
installation, smoke, CI build, tests and total orchestration (image load/build and
save included). `runner.json` records image ID, hit/miss and shard. Existing JSON,
HTML, Wrangler logs, startup/build timing and summary are retained. Stale result
files are cleared before an attempt. Timing upload is unconditional; failures
upload diagnostics, including the font screenshot. GitHub job summaries include
cache restore/save and artifact upload through completed-job timings.

The saved cloud environment has read-only home directories and a preconfigured
egress proxy. Docker client metadata is kept in disposable project state. If a
host already sets HTTP(S)_PROXY and NODE_EXTRA_CA_CERTS, those settings can be
reused with the existing CA file mounted read-only; no CA is installed and TLS
verification is not disabled. `NODE_USE_ENV_PROXY=1` is needed for Node fetch in
that environment. Hosted Actions normally needs neither override.

## Measurement protocol and limits

Freeze application/dependencies and candidate implementation before comparing
first and warm attempts. Record SHA, image ID, runner/storage driver, shard/test
counts, outcomes, dependency-store state and every stage. Include image download,
build/load, dependency installation, smoke, application build, migrations, tests
and cache save; distinguish a pre-fetched base image or populated BuildKit cache
from a fully cold image acquisition. Run both shards with one worker each, using
identical source, lock and test conditions. Do not sum overlapping startup and
Playwright timings.

A local simulated Actions identity checks the prebuild contract but is not a
hosted Actions execution. Local sequential shards do not measure hosted parallel
wall-clock or actual Actions cache/artifact upload costs. The Docker vfs driver
copies whole filesystems per layer/container and can exhaust this environment's
32 GB disk during iterative image builds. Clean only resources created by the
experiment; do not switch storage drivers or host settings to continue.

Nix is absent in this saved environment, so a controlled Nix cold/warm baseline
has not been measured. Historical main/PR times, different Wrangler updates and
old failed preparation runs are not comparable performance evidence. No speedup
is claimed. Hosted adoption, registry-signature policy, cache-size economics and
controlled Nix comparison remain review items.
