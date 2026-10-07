# Nix E2E candidate

This candidate extends PR #508 and the main revision containing Renovate #509.
Hosted acceptance and a speed comparison are recorded separately after completion.

## Reproduction

Use Linux x86_64 with a working Nix installation and `/nix/store`. The official
single-user installer used by the candidate workflows is hash-pinned in
`scripts/install-nix-e2e.sh`; it installs no daemon and changes no security sysctl.
The workflow continues to use two runners, two shards, and one worker per shard.

```bash
bash scripts/nix-e2e.sh tools
source .tmp-nix-e2e/env.sh
pnpm install --frozen-lockfile
bash scripts/nix-e2e.sh browsers
pnpm test:e2e --shard=1/2
# Run shard 2 in its own checkout/runner, or sequentially after shard 1 exits.
pnpm test:e2e --shard=2/2
```

Each local invocation clears its disposable D1 state and starts a new Wrangler
server. Concurrent local invocations require separate checkouts and ports; the
candidate does not change the existing port or test distribution. Local commands
use the normal build path. The CI-only prebuild flag remains guarded by the
existing checkout/run/environment/output digest manifest.

`flake.lock` fixes nixpkgs. Node is its signed cached `nodejs-slim_24` output,
with its version checked against `.node_version`. Nixpkgs has a different pnpm
version, so the exact published pnpm bundle and native Linux executable are both
content-hash pinned. Neither Rust nor Chromium is compiled. The native executable
is copied into disposable project state next to the bundle's node-gyp payload.
Updates to project Node/pnpm or Playwright require reviewing these pins.

The project-installed Playwright package is checked against nixpkgs metadata
before launching the browser. The candidate exposes only its matching official
Chromium Headless Shell and FFmpeg. Nixpkgs patches the shell's interpreter and
RPATH to its Nix library closure; it does not replace it with system Chromium.
`FONTCONFIG_FILE` selects Noto CJK and DejaVu fonts explicitly, including a writable
project font cache. Preparation checks FFmpeg, Japanese font selection, browser
version and a Japanese-text screenshot before declaring success.

This target is Ubuntu/Debian with a normal host glibc loader. The published pnpm
native executable and npm-installed workerd use the host loader/libc. This is not
an assertion of native NixOS support or an entirely Nix-built runtime. No global
`LD_LIBRARY_PATH`, sandbox setting, reset guard or browser launch options change.
The Playwright default remains headless Chromium with its existing sandbox
behavior. A sandbox-enabled Chromium deployment is outside this E2E candidate.

## Cache and failure policy

All nixpkgs outputs must be available from the signed official `cache.nixos.org`
cache or already in the local store. Commands enforce signature checks, set the
remote builder list empty and set maximum local build jobs to zero. Cache misses
fail preparation. The npm bundles are an explicit content-hash verified exception
from the official npm registry, fetched by Nix evaluation without compilation.
No third-party cache, paid service, credentials or new trusted signing key is used.

GitHub Actions caches `/nix` and the Nix evaluation cache under an exact key
covering the lock, version definitions and preparation code. Installation from
the hash-pinned official archive runs before restoration. This is a trusted
branch-scoped Actions cache, including its Nix executable/database/profile, not
a new public binary cache. After restoration, preparation verifies the contents
and trusted signatures of the tools/browser library closures. The two npm source
paths are also content-verified; their content addresses are the explicit
exception to signed nixpkgs outputs. This does not claim to independently verify
the entire Actions cache. Cache restore and post-job saving appear in job timings.

A cold/warm comparison reruns the same PR CI once after its initial cache save,
keeping the original event checkout SHA. Both shards must report `cache-hit=true`
for the second attempt to count as warm. A `workflow_dispatch` on the head branch
cannot read the pull-request merge-ref cache and is not a warm continuation.

Tools prepare before dependency installation. Browser/font cache retrieval and
its smoke test then run in the existing browser background step while the
application builds. The unchanged `wait` requires both preparations to succeed.
An unsupported revision, unavailable cache or failed smoke test stops the tests.
The prebuild verifier and independent shard D1 stores remain mandatory.

## Measurements and acceptance

No speedup is claimed. Include Nix installer download/installation, nixpkgs
resolution, native pnpm fetch/copy, Node closure retrieval, pnpm dependency
installation, browser/library/font closure retrieval, font smoke test, prebuild,
wait, D1 startup, all tests and artifact upload in the comparison. Cold retrieval
can exceed the previous APT/browser setup, especially on a newer runner image.

Evaluation, downloads, closure verification, pnpm setup and browser smoke each
have a separate timing record. Preparation also records success/failure and wall timestamps in
`.tmp-nix-e2e/{installer,tools,browsers}-timing.json`; those records and the resolved
manifest join the existing always-uploaded timing artifact. Preparation intervals
overlap the background build and must not be added to job time. Existing E2E
startup/build/test timings remain intact. The existing step/job summary also
shows Nix installation and each preparation step by name.

After approval, freeze the same application/dependency/test revisions for the
#508 baseline and Nix candidate. Run each on the same runner image with two shards
and 118 tests, once cold and once with the candidate's ordinary warm store. Record
image version, cache hit/miss, archive/closure sizes, setup intervals, job wall
clock, startup, test counts, failures/flakes/skips and artifacts for every attempt.
A warm measurement must reuse the same runner/store deliberately; a separate
GitHub job or rerun does not guarantee a warm Nix store.
If that minimal feasibility comparison is competitive, collect several alternating
pairs before adopting it. Do not compare a cold Nix run with a warm APT run or
omit installer/cache costs. A local proot execution checks compatibility but its
ptrace overhead cannot estimate GitHub runner performance.
