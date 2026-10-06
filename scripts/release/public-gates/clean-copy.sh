#!/usr/bin/env bash
# Builds, checks and packs a generated public tree the way the public repo will:
# a fresh copy with no internal files, no secrets and only the committed lockfile.
# Usage: clean-copy.sh <tree-dir> <tarball-out-dir>
set -euo pipefail

here="$(dirname "$(realpath "$0")")"
tree="$(realpath "$1")"
out="$(realpath -m "$2")"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

cp -a "$tree/." "$work"
mkdir -p "$out"
cd "$work"

# `build:ci` diffs generated files against HEAD, so the copy needs a commit.
git init -q
git add -A
git -c user.name=public-gates -c user.email=public-gates@localhost \
  -c commit.gpgsign=false commit -qm snapshot

export CI=true HUSKY=0
pnpm install --frozen-lockfile
pnpm build:ci
pnpm lint
# Fork projects need RPC secrets, which the public CI doesn't have either.
pnpm exec vitest run --project '!*-fork'

packages="$(mktemp)"
node "$here/public-packages.ts" --tree . > "$packages"
while IFS= read -r -d '' dir; do
  ( cd "$dir" && pnpm pack --pack-destination "$out" )
done < "$packages"

( cd "$out" && sha256sum ./*.tgz > SHA256SUMS )
