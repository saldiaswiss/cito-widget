#!/usr/bin/env bash
# Build the storefront JS and copy the output into the platform client repos.
#
#   tools/sync-clients.sh            build, copy, show what changed in each client
#   tools/sync-clients.sh --dry-run  build, show what WOULD change, copy nothing
#   tools/sync-clients.sh --no-build copy the existing dist/ (e.g. right after a build)
#
# Each copied file gets a one-line header `/* cito-widget <hash> <date> */` naming the
# source commit, so a shop's served file can be traced back here. dist/ itself stays
# header-less (it is byte-compared against the vendored files during the cut-over).
# Shipping to the shops is the CLIENT repo's rollout (see AGENTS.md Deploy Workflow).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CSCART_DIR="${CITO_CSCART_DIR:-$HOME/dev/cs-cart-addons/cito/js/addons/nl_cito}"
WP_DIR="${CITO_WP_DIR:-$HOME/dev/cito-wordpress/assets/js}"

DRY=0; BUILD=1
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY=1 ;;
    --no-build) BUILD=0 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

cd "$HERE"
if [ "$BUILD" = 1 ]; then
  npm run build
fi
for f in widget.js assistant.js func.js; do
  [ -s "dist/$f" ] || { echo "dist/$f missing - build failed?" >&2; exit 1; }
done

HASH="$(git rev-parse --short HEAD)"
DIRTY=""; git diff --quiet HEAD -- src assistant dropdown vite.config.js package.json 2>/dev/null || DIRTY="+dirty"
STAMP="/* cito-widget ${HASH}${DIRTY} $(date -u +%Y-%m-%dT%H:%MZ) */"
echo "source: ${HASH}${DIRTY}"

# drop the `/* cito-widget ... */` header line a previous sync prepended, so the
# comparison below is source-vs-source. awk, not sed: BSD sed (macOS - this repo is
# worked on from two machines) rejects `1{/re/d}` without a separator before the brace.
strip_stamp() { awk 'NR==1 && /^\/\* cito-widget /{next} {print}' "$1"; }

# copy one built file into a client dir with the header line prepended; prints the
# diff stat against what the client had (header line excluded, so a rebuild that
# changed nothing reads as "unchanged")
copy_one() {
  local src="$1" dest_dir="$2" name; name="$(basename "$src")"
  local dest="$dest_dir/$name"
  if [ ! -d "$dest_dir" ]; then echo "  $dest_dir: directory missing, skipped" >&2; return; fi
  local status="new"
  if [ -f "$dest" ]; then
    if cmp -s <(strip_stamp "$dest") "$src"; then status="unchanged"
    else status="changed ($(diff <(strip_stamp "$dest") "$src" | grep -c '^[<>]' || true) lines differ)"; fi
  fi
  echo "  $dest: $status"
  if [ "$DRY" = 0 ] && [ "$status" != "unchanged" ]; then
    { echo "$STAMP"; cat "$src"; } > "$dest"
  fi
}

echo "CS-Cart addon ($CSCART_DIR):"
for f in widget.js assistant.js func.js; do copy_one "dist/$f" "$CSCART_DIR"; done
echo "WordPress plugin ($WP_DIR):"
for f in widget.js assistant.js; do copy_one "dist/$f" "$WP_DIR"; done

if [ "$DRY" = 1 ]; then echo "(dry run - nothing copied)"; exit 0; fi
for d in "$CSCART_DIR" "$WP_DIR"; do
  [ -d "$d" ] || continue
  echo "git status in $d:"
  git -C "$d" status --short -- . | sed 's/^/  /'
done
