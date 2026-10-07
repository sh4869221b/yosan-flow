#!/usr/bin/env bash
set -euo pipefail
stage=${1:?Expected tools or browsers}
case "$stage" in tools|browsers) ;; *) exit 2 ;; esac
mkdir -p .tmp-nix-e2e
started=$(date +%s%3N)
record_timing() {
  status=$?
  finished=$(date +%s%3N)
  printf '{"stage":"%s","startedAt":%s,"completedAt":%s,"status":%s}\n' \
    "$stage" "$started" "$finished" "$status" > ".tmp-nix-e2e/$stage-timing.json"
}
trap record_timing EXIT
measure() {
  local name=$1
  shift
  local start end result
  start=$(date +%s%3N)
  if "$@"; then result=0; else result=$?; fi
  end=$(date +%s%3N)
  printf '{"stage":"%s","startedAt":%s,"completedAt":%s,"status":%s}\n' \
    "$name" "$start" "$end" "$result" > ".tmp-nix-e2e/$name-timing.json"
  return "$result"
}
nix_command=${NIX:-nix}
nix_flags=(--extra-experimental-features 'nix-command flakes'
  --option substituters https://cache.nixos.org --option require-sigs true
  --option builders '' --option max-jobs 0)
if [[ "$stage" == tools ]]; then
  measure tools-evaluate "$nix_command" "${nix_flags[@]}" eval --no-update-lock-file .#e2eManifest --json > .tmp-nix-e2e/manifest.tmp
  mv .tmp-nix-e2e/manifest.tmp .tmp-nix-e2e/manifest.json
  measure tools-fetch "$nix_command" "${nix_flags[@]}" build --no-update-lock-file --out-link .tmp-nix-e2e/tools .#node .#bash .#coreutils
  node_path=$("$nix_command" "${nix_flags[@]}" eval --no-update-lock-file .#e2eManifest.paths.node --raw)
  measure tools-verify "$nix_command" "${nix_flags[@]}" store verify --no-update-lock-file \
    --recursive --sigs-needed 1 .#node .#bash .#coreutils \
    .#e2eManifest.pnpmSource .#e2eManifest.pnpmNative
  measure tools-configure "$node_path/bin/node" scripts/nix-e2e.ts tools
else
  measure browsers-fetch "$nix_command" "${nix_flags[@]}" build --no-update-lock-file --out-link .tmp-nix-e2e/browsers \
    .#headless-shell .#ffmpeg .#fonts .#dejavu .#fontconfig
  # tools was prepared in the preceding step (or sourced for a local run).
  measure browsers-verify "$nix_command" "${nix_flags[@]}" store verify --no-update-lock-file \
    --recursive --sigs-needed 1 .#headless-shell .#ffmpeg .#fonts .#dejavu .#fontconfig
  measure browsers-smoke node scripts/nix-e2e.ts browsers
fi
