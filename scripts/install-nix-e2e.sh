#!/usr/bin/env bash
set -euo pipefail
# Official single-user installer. No daemon, third-party cache, or sysctl changes.
archive=nix-2.26.3-x86_64-linux.tar.xz
started=$(date +%s%3N)
mkdir -p .tmp-nix-e2e
record_timing() {
  status=$?
  printf '{"stage":"installer","startedAt":%s,"completedAt":%s,"status":%s}\n' \
    "$started" "$(date +%s%3N)" "$status" > .tmp-nix-e2e/installer-timing.json
}
trap record_timing EXIT
curl --fail --location --retry 3 "https://releases.nixos.org/nix/nix-2.26.3/$archive" -o ".tmp-nix-e2e/$archive"
printf '%s  %s\n' d378a057253fb98f05c3e7c431c1852cca6afae3376f5853a9fcb7ae423a05ad ".tmp-nix-e2e/$archive" | sha256sum --check
tar -xJf ".tmp-nix-e2e/$archive" -C .tmp-nix-e2e
bash .tmp-nix-e2e/nix-2.26.3-x86_64-linux/install --no-daemon --no-modify-profile --no-channel-add --yes
printf '%s\n' "$HOME/.nix-profile/bin" >> "$GITHUB_PATH"
rm -rf ".tmp-nix-e2e/$archive" .tmp-nix-e2e/nix-2.26.3-x86_64-linux
