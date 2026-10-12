#!/usr/bin/env bash
set -euo pipefail
# Pass Playwright options as literal argv, including --shard=1/2 or --shard=2/2.
# Default local invocation runs the complete suite with the existing single worker.
node scripts/e2e-container-config.ts >/dev/null
mkdir -p .tmp-container-e2e .tmp-container-store
export DOCKER_CONFIG="$PWD/.tmp-container-e2e/docker-config"
rm -f .tmp-container-e2e/*-timing.json .tmp-container-e2e/manifest.json .tmp-container-e2e/runner.json .tmp-container-e2e/japanese-font.png .tmp-e2e-timing.json .tmp-e2e-build.json
rm -rf test-results playwright-report
started=$(date +%s%3N)
record_timing() {
  status=$?
  printf '{"stage":"total","startedAt":%s,"completedAt":%s,"status":%s}\n' "$started" "$(date +%s%3N)" "$status" > .tmp-container-e2e/total-timing.json
}
measure() {
  local name=$1 start end status
  shift
  start=$(date +%s%3N)
  if "$@"; then status=0; else status=$?; fi
  end=$(date +%s%3N)
  printf '{"stage":"%s","startedAt":%s,"completedAt":%s,"status":%s}\n' "$name" "$start" "$end" "$status" > ".tmp-container-e2e/$name-timing.json"
  return "$status"
}
trap record_timing EXIT
trap 'exit 143' TERM
trap 'exit 130' INT
node scripts/e2e-container-config.ts > .tmp-container-e2e/config.json
playwright_image=$(node scripts/e2e-container-config.ts playwrightImage)
node_image=$(node scripts/e2e-container-config.ts nodeImage)
mkdir -p .tmp-container-e2e/image-context
cp tooling/ci/container/Dockerfile tooling/ci/container/fonts.conf .tmp-container-e2e/image-context/
image_key=$(cat tooling/ci/container/Dockerfile tooling/ci/container/fonts.conf tooling/ci/container/image.json .node_version | sha256sum | cut -d' ' -f1)
image="yosan-flow-e2e:$image_key"
cache_hit=false
if docker image inspect "$image" >/dev/null 2>&1; then
  cache_hit=true
else
  measure image-pull-playwright docker pull "$playwright_image" &
  playwright_pull=$!
  measure image-pull-node docker pull "$node_image" &
  node_pull=$!
  status=0
  wait "$playwright_pull" || status=1
  wait "$node_pull" || status=1
  [[ $status == 0 ]] || exit "$status"
  measure image-build docker build --build-arg HTTP_PROXY --build-arg HTTPS_PROXY --build-arg NO_PROXY --platform linux/amd64 --build-arg "PLAYWRIGHT_IMAGE=$playwright_image" --build-arg "NODE_IMAGE=$node_image" --tag "$image" .tmp-container-e2e/image-context
fi
image_id=$(docker image inspect "$image" --format '{{.Id}}')
printf '{"image":"%s","imageId":"%s","localImageCacheHit":%s}\n' "$image" "$image_id" "$cache_hit" > .tmp-container-e2e/runner.json
# Egress proxy and CI identity only. Do not forward cloud credentials or app env.
environment=()
for key in CI GITHUB_ACTIONS GITHUB_SHA GITHUB_RUN_ID GITHUB_RUN_ATTEMPT GITHUB_JOB HTTP_PROXY HTTPS_PROXY NO_PROXY NODE_USE_ENV_PROXY; do
  if [[ -v $key ]]; then environment+=(--env "$key"); fi
done
certificate=()
if [[ -n ${NODE_EXTRA_CA_CERTS:-} ]]; then
  test -f "$NODE_EXTRA_CA_CERTS"
  certificate=(--mount "type=bind,src=$NODE_EXTRA_CA_CERTS,dst=/tmp/egress-ca.crt,readonly" --env NODE_EXTRA_CA_CERTS=/tmp/egress-ca.crt)
fi
# Read-only external Git metadata supports linked worktrees and CI SHA verification.
git_metadata=()
common_directory=$(realpath "$(git rev-parse --git-common-dir)")
case "$common_directory" in
  "$PWD"/*) ;;
  *) git_metadata=(--mount "type=bind,src=$common_directory,dst=$common_directory,readonly") ;;
esac
docker run --rm --init --platform linux/amd64 --shm-size=1g \
  --user "$(id -u):$(id -g)" --workdir /work/yosan-flow \
  --env HOME=/tmp --env PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  "${environment[@]}" "${certificate[@]}" "${git_metadata[@]}" \
  --mount "type=bind,src=$PWD,dst=/work/yosan-flow" \
  --mount "type=bind,src=$PWD/.tmp-container-store,dst=/pnpm-store" \
  --mount "type=volume,dst=/work/yosan-flow/node_modules,volume-nocopy" \
  "$image" bash scripts/e2e-container-inner.sh "$@"
