#!/usr/bin/env bash
set -euo pipefail
mkdir -p .tmp-container-e2e
measure() {
  local stage=$1 start end status
  shift
  start=$(date +%s%3N)
  if "$@"; then status=0; else status=$?; fi
  end=$(date +%s%3N)
  printf '{"stage":"%s","startedAt":%s,"completedAt":%s,"status":%s}\n' "$stage" "$start" "$end" "$status" > ".tmp-container-e2e/$stage-timing.json"
  return "$status"
}
measure tools node scripts/e2e-container-prepare.ts
export PATH="$PWD/.tmp-container-e2e/pnpm:$PATH"
measure dependencies pnpm install --frozen-lockfile --store-dir /pnpm-store
measure smoke node scripts/e2e-container-smoke.ts
if [[ ${GITHUB_ACTIONS:-} == true ]]; then
  measure build node scripts/e2e-build.ts build
  export YOSAN_FLOW_E2E_PREBUILT=1
fi
measure tests pnpm run test:e2e:worker "$@" --workers=1
