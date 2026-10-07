#!/usr/bin/env bash
set -euo pipefail

validate_cache() {
  local cache="$1" entry count=0 bytes=0
  [[ ! -L "$cache" ]] || { echo 'APT cache directory must not be a symlink' >&2; return 1; }
  mkdir -p "$cache"
  while IFS= read -r -d '' entry; do
    [[ -f "$entry" && ! -L "$entry" && "${entry##*/}" =~ ^[a-z0-9][a-z0-9.+%-]*_[^/[:space:]]+_(all|amd64|arm64|i386|armhf)\.deb$ ]] || {
      echo 'APT cache contains an unexpected file type or archive name' >&2
      return 1
    }
    count=$((count + 1))
    bytes=$((bytes + $(stat -c %s "$entry")))
    [[ "$count" -le 256 && "$bytes" -le 1073741824 ]] || { echo 'APT archive cache exceeds safety bounds' >&2; return 1; }
  done < <(find "$cache" -mindepth 1 -maxdepth 1 -print0)
}

case "${1:-}" in
  validate)
    validate_cache "$2"
    ;;
  key)
    # Daily, exact-match cache; package authenticity is checked by APT on reuse.
    # Do not include ImageVersion: validated identical archives can cross image revisions.
    fingerprint=$({
      cat /etc/os-release
      dpkg --print-architecture
      apt-get --version | head -n 1
      find /etc/apt -maxdepth 2 -type f \( -name '*.list' -o -name '*.sources' -o -name '*mirrors*' \) -print0 | sort -z | xargs -0 -r sha256sum
      sha256sum pnpm-lock.yaml scripts/e2e-apt-cache.sh
      date -u +%F
    } | sha256sum | cut -d ' ' -f 1)
    echo "key=e2e-apt-debs-v1-${fingerprint}" >> "$GITHUB_OUTPUT"
    printf 'APT cache runner image: %s / %s; architecture: %s\n' "${ImageOS:-unknown}" "${ImageVersion:-unknown}" "$(dpkg --print-architecture)"
    ;;
  install)
    cache="$PWD/.tmp-e2e-apt-cache"
    validate_cache "$cache"
    work=$(mktemp -d "$PWD/.tmp-e2e-apt.XXXXXX")
    chmod 755 "$work"
    archives="$work/archives"
    sudo install -d -m 755 "$archives"
    sudo install -d -o _apt -g root -m 700 "$archives/partial"
    shopt -s nullglob
    cached=("$cache"/*.deb)
    printf 'APT restored archives staged for hash-checked acquisition: %s\n' "${#cached[@]}"
    # Never restore final archives: APT may accept those on size alone. Its HTTP(S)
    # acquisition verifies full partial files against the authenticated index hash.
    for archive in "${cached[@]}"; do
      sudo install -m 644 "$archive" "$archives/partial/${archive##*/}"
    done
    config="$work/apt.conf"
    printf 'Dir::Cache::archives "%s/";\nAPT::Keep-Downloaded-Packages "true";\nAPT::Update::Error-Mode "any";\n' "$archives" > "$config"
    effective=$(sudo env APT_CONFIG="$config" apt-config shell archives Dir::Cache::archives keep APT::Keep-Downloaded-Packages errors APT::Update::Error-Mode)
    [[ "$effective" == "archives='$archives/';"$'\n'"keep='true';"$'\n'"errors='any';" ]] || { echo 'Unexpected effective APT cache configuration' >&2; exit 1; }
    # Run only dependency installation as root so APT_CONFIG reaches the upstream
    # apt-get update && apt-get install. No persistent /etc changes or hook removal.
    cli=$(node -p "require.resolve('@playwright/test/cli')")
    sudo env APT_CONFIG="$config" "$(command -v node)" "$cli" install-deps chromium
    # Only successful final acquisitions are saved; never partial files or OS state.
    rm -f "${cached[@]}"
    acquired=("$archives"/*.deb)
    for archive in "${acquired[@]}"; do
      [[ -f "$archive" && ! -L "$archive" ]] || exit 1
      install -m 644 "$archive" "$cache/${archive##*/}"
    done
    validate_cache "$cache"
    printf 'APT acquired archives available for save: %s\n' "${#acquired[@]}"
    du -sb "$cache"
    pnpm exec playwright install --only-shell chromium
    ;;
  *) echo 'Expected key, validate <directory>, or install' >&2; exit 1 ;;
esac
