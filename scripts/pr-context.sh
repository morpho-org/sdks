#!/bin/sh
# Runs pr-context, installing it from morpho-org/internal-tools on first use.
# Copy unchanged into a repository and expose it as a package script. See
# https://github.com/morpho-org/internal-tools/blob/main/docs/install.md
set -eu
bin_dir=${PR_CONTEXT_BIN_DIR:-"$HOME/.local/bin"}
if [ -x "$bin_dir/pr-context" ]; then exec "$bin_dir/pr-context" "$@"; fi
if command -v pr-context >/dev/null 2>&1; then exec pr-context "$@"; fi
command -v gh >/dev/null 2>&1 || { echo 'pr-context needs GitHub CLI: install gh, then run gh auth login --hostname github.com.' >&2; exit 1; }
echo 'Installing pr-context (first use)...' >&2
bootstrap=$(GH_HOST=github.com gh api repos/morpho-org/internal-tools/contents/packages/pr-context/scripts/bootstrap.sh \
  -H 'Accept: application/vnd.github.raw+json') || { echo 'Could not fetch the pr-context installer; check gh auth status and access to morpho-org/internal-tools.' >&2; exit 1; }
printf '%s\n' "$bootstrap" | sh -s -- --bin-dir "$bin_dir" >&2
exec "$bin_dir/pr-context" "$@"
