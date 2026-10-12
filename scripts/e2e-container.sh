#!/usr/bin/env bash
set -euo pipefail
shard=${1:?Expected shard 1 or 2}
case "$shard" in 1|2) ;; *) exit 2 ;; esac
mkdir -p .tmp-container-e2e .tmp-container-cache .tmp-container-store
# Keep Docker client build metadata in writable, disposable project state.
export DOCKER_CONFIG="$PWD/.tmp-container-e2e/docker-config"
rm -f .tmp-container-e2e/*-timing.json .tmp-container-e2e/manifest.json .tmp-container-e2e/runner.json .tmp-container-e2e/japanese-font.png .tmp-e2e-timing.json .tmp-e2e-build.json
rm -rf test-results playwright-report
started=$(date +%s%3N)
record_timing() {
  status=$?
  finished=$(date +%s%3N)
  printf '{"stage":"total","startedAt":%s,"completedAt":%s,"status":%s}\n' "$started" "$finished" "$status" > .tmp-container-e2e/total-timing.json
}
trap record_timing EXIT
trap 'exit 143' TERM
trap 'exit 130' INT
node scripts/e2e-container-config.ts > .tmp-container-e2e/config.json
playwright_image=$(node scripts/e2e-container-config.ts playwrightImage)
node_image=$(node scripts/e2e-container-config.ts nodeImage)
# The small build context cannot accidentally include secrets or local D1 state.
mkdir -p .tmp-container-e2e/image-context
cp tooling/ci/container/Dockerfile tooling/ci/container/fonts.conf .tmp-container-e2e/image-context/
image_key=$(cat tooling/ci/container/Dockerfile tooling/ci/container/fonts.conf tooling/ci/container/image.json .node_version | sha256sum | cut -d' ' -f1)
image="yosan-flow-e2e:$image_key"
if [[ -f .tmp-container-cache/image.tar.gz ]]; then
  docker load --input .tmp-container-cache/image.tar.gz
fi
cache_hit=false
if docker image inspect "$image" >/dev/null 2>&1; then
  cache_hit=true
else
  docker build --build-arg HTTP_PROXY --build-arg HTTPS_PROXY --build-arg NO_PROXY --platform linux/amd64 --build-arg "PLAYWRIGHT_IMAGE=$playwright_image" --build-arg "NODE_IMAGE=$node_image" --tag "$image" .tmp-container-e2e/image-context
fi
image_id=$(docker image inspect "$image" --format '{{.Id}}')
printf '{"image":"%s","imageId":"%s","cacheHit":%s,"shard":%s}\n' "$image" "$image_id" "$cache_hit" "$shard" > .tmp-container-e2e/runner.json
# Explicit allowlist: existing egress proxy and CI identity only; no cloud tokens.
environment=()
for key in CI GITHUB_ACTIONS GITHUB_SHA GITHUB_RUN_ID GITHUB_RUN_ATTEMPT GITHUB_JOB HTTP_PROXY HTTPS_PROXY NO_PROXY NODE_USE_ENV_PROXY; do
  if [[ -v $key ]]; then environment+=(--env "$key"); fi
done
# Reuse an already configured host egress CA read-only, without installing a
# new trust root or disabling TLS verification. Hosted Actions needs no override.
certificate=()
if [[ -n ${NODE_EXTRA_CA_CERTS:-} ]]; then
  test -f "$NODE_EXTRA_CA_CERTS"
  certificate=(--mount "type=bind,src=$NODE_EXTRA_CA_CERTS,dst=/tmp/egress-ca.crt,readonly" --env NODE_EXTRA_CA_CERTS=/tmp/egress-ca.crt)
fi
# A linked local worktree points to a Git directory outside the checkout.
# Mount that existing metadata read-only so the prebuild identity can verify HEAD.
git_metadata=()
common_directory=$(realpath "$(git rev-parse --git-common-dir)")
case "$common_directory" in
  "$PWD"/*) ;;
  *) git_metadata=(--mount "type=bind,src=$common_directory,dst=$common_directory,readonly") ;;
esac
# Private IPC/shared memory rather than modifying host IPC or security settings.
status=0
docker run --rm --init --platform linux/amd64 --shm-size=1g \
  --user "$(id -u):$(id -g)" --workdir /work/yosan-flow \
  --env HOME=/tmp --env PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  "${environment[@]}" "${certificate[@]}" "${git_metadata[@]}" \
  --mount "type=bind,src=$PWD,dst=/work/yosan-flow" \
  --mount "type=bind,src=$PWD/.tmp-container-store,dst=/pnpm-store" \
  "$image" bash scripts/e2e-container-inner.sh "$shard" || status=$?
if [[ $status == 0 && ${GITHUB_ACTIONS:-} == true && ! -f .tmp-container-cache/image.tar.gz ]]; then
  docker save "$image" | gzip > .tmp-container-cache/image.tar.gz.tmp
  mv .tmp-container-cache/image.tar.gz.tmp .tmp-container-cache/image.tar.gz
fi
exit "$status"
