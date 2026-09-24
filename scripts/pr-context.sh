#!/bin/sh
# Runs pr-context, installing it from morpho-org/internal-tools on first use or
# when the installed version is older than `minimum`.
# Copy unchanged into a repository and expose it as a package script. See
# https://github.com/morpho-org/internal-tools/blob/main/docs/install.md
set -eu
minimum=0.14.3
bin_dir=${PR_CONTEXT_BIN_DIR:-"$HOME/.local/bin"}
installed="$bin_dir/pr-context"
if [ -x "$installed" ]; then
  cli=$installed
else
  cli=$(command -v pr-context 2>/dev/null) || cli=
fi
current() {
  version=$("$1" --version 2>/dev/null | sed -n 's/^pr-context v//p') || version=
  lowest=$(printf '%s\n%s\n' "$version" "$minimum" | sort -t. -k1,1n -k2,2n -k3,3n | head -n 1)
  [ -n "$version" ] && [ "$lowest" = "$minimum" ]
}
if [ -n "$cli" ] && current "$cli"; then
  exec "$cli" "$@"
fi
command -v gh >/dev/null 2>&1 || {
  echo 'pr-context needs GitHub CLI: install gh, then run gh auth login --hostname github.com.' >&2
  exit 1
}
echo "Installing pr-context (needs v$minimum or newer)..." >&2
bootstrap=$(GH_HOST=github.com gh api \
  repos/morpho-org/internal-tools/contents/packages/pr-context/scripts/bootstrap.sh \
  -H 'Accept: application/vnd.github.raw+json') || {
  echo 'Could not fetch the pr-context installer; check gh auth status and access to morpho-org/internal-tools.' >&2
  exit 1
}
install() {
  result=$(printf '%s\n' "$bootstrap" | sh -s -- --bin-dir "$bin_dir" "$@")
  printf '%s\n' "$result" | head -n 1 >&2
}
install
if ! current "$installed"; then
  install --version "$minimum"
  current "$installed" || {
    echo "pr-context v$minimum or newer is required but could not be installed." >&2
    exit 1
  }
fi
exec "$installed" "$@"
