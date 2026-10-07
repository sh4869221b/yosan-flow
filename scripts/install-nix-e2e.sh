#!/usr/bin/env bash
set -euo pipefail
# Official single-user installer. No daemon, third-party cache, or sysctl changes.
archive=nix-2.26.3-x86_64-linux.tar.xz
started=$(date +%s%3N)
mode=cold
mkdir -p .tmp-nix-e2e
record_timing() {
  status=$?
  printf '{"stage":"installer","mode":"%s","startedAt":%s,"completedAt":%s,"status":%s}\n' \
    "$mode" "$started" "$(date +%s%3N)" "$status" > .tmp-nix-e2e/installer-timing.json
}
trap record_timing EXIT
if [[ "${NIX_CACHE_HIT:-}" == true ]]; then
  mode=cached
  cached_executable=$(cat /nix/.yosan-e2e-nix-path)
  [[ "$cached_executable" == /nix/store/*/bin/nix ]]
  [[ "$("$cached_executable" --version)" == "nix (Nix) 2.26.3" ]]
  printf '%s\n' "$(dirname "$cached_executable")" >> "$GITHUB_PATH"
  exit 0
fi
# A failed extraction may leave a partially restored store. Do not accept it.
if [[ -n "$(find /nix -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
  echo 'Nix cache restoration did not report an exact successful hit; refusing partial store.' >&2
  exit 1
fi
curl --fail --location --retry 3 "https://releases.nixos.org/nix/nix-2.26.3/$archive" -o ".tmp-nix-e2e/$archive"
printf '%s  %s\n' d378a057253fb98f05c3e7c431c1852cca6afae3376f5853a9fcb7ae423a05ad ".tmp-nix-e2e/$archive" | sha256sum --check
tar -xJf ".tmp-nix-e2e/$archive" -C .tmp-nix-e2e
bash .tmp-nix-e2e/nix-2.26.3-x86_64-linux/install --no-daemon --no-modify-profile --no-channel-add --yes
nix_executable=$(readlink -f "$HOME/.nix-profile/bin/nix")
[[ "$nix_executable" == /nix/store/*/bin/nix ]]
[[ "$("$nix_executable" --version)" == "nix (Nix) 2.26.3" ]]
printf '%s\n' "$nix_executable" > /nix/.yosan-e2e-nix-path
printf '%s\n' "$(dirname "$nix_executable")" >> "$GITHUB_PATH"
rm -rf ".tmp-nix-e2e/$archive" .tmp-nix-e2e/nix-2.26.3-x86_64-linux
