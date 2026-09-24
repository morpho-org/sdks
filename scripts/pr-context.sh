#!/bin/sh
# Runs the pr-context release pinned by `version`, installing it from
# morpho-org/internal-tools on first use. Each version installs into its own
# directory, so repositories pinning different versions never replace each other.
# Copy unchanged into a repository and expose it as a package script. See
# https://github.com/morpho-org/internal-tools/blob/main/docs/install.md
set -eu
version=0.14.5
cli="${PR_CONTEXT_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/pr-context}/$version/pr-context"
pinned() { [ -x "$cli" ] && [ "$("$cli" --version 2>/dev/null)" = "pr-context v$version" ]; }
if pinned; then
  exec "$cli" "$@"
fi
command -v gh >/dev/null 2>&1 || {
  echo 'pr-context needs GitHub CLI: install gh, then run gh auth login --hostname github.com.' >&2
  exit 1
}
echo "Installing pr-context v$version..." >&2
bootstrap=$(GH_HOST=github.com gh api \
  "repos/morpho-org/internal-tools/contents/packages/pr-context/scripts/bootstrap.sh?ref=%40morpho-org%2Fpr-context%40$version" \
  -H 'Accept: application/vnd.github.raw+json') || {
  echo 'Could not fetch the pr-context installer; check gh auth status and access to morpho-org/internal-tools.' >&2
  exit 1
}
result=$(printf '%s\n' "$bootstrap" | sh -s -- --bin-dir "${cli%/*}" --version "$version") || :
[ -z "$result" ] || printf '%s\n' "$result" | head -n 1 >&2
pinned || {
  echo "pr-context v$version could not be installed." >&2
  exit 1
}
exec "$cli" "$@"
