# ADR-2026-11-18: Use Bun for workspace package management

| Field      | Value      |
| ---------- | ---------- |
| **Date**   | 2026-11-18 |
| **Author** | Devin      |
| **Scope**  | Repo-wide  |

_Frozen after merge; only superseded-by entries in References change._

## Context

The SDK workspace used pnpm for dependency resolution, script orchestration and
packing. Moving those tasks to Bun required preserving isolated dependency
resolution, the three-day dependency release delay and the published package
metadata. Bun's release-age filter alone did not replace pnpm's strict rejection
of ineligible locked versions before install-time code ran. Privileged release
jobs also needed dependency installation separated from write-token use.

## Decision

Use Bun 1.4.4 with a committed lockfile and frozen CI installs. Keep Node 26 as
the script runtime: Bun runs with the system shell and does not substitute its
runtime for Node. Use the isolated linker, disable hoisting and the global store,
and disable runtime automatic dependency installation. Keep the minimum release
age at 259200 seconds. Explicitly trust only the six existing build-script
packages: `@biomejs/biome`, `bufferutil`, `esbuild`, `keccak`, `secp256k1` and
`utf-8-validate`.

Replace pnpm's strict release-age boundary with `check-release-age.ts`: validate
every locked registry publication timestamp before workflow installs, reject
non-registry sources, and fail closed on missing metadata. Security exceptions
waive only the age of a reviewed exact identity, not timestamp validity.
Configure Bun's Security Scanner API in `bunfig.toml` to use the same policy
after resolution and before installs, including raw `bun add`, `bun update`
and `bun install`. Bun does not run this check as a lifecycle script.
Locally, use `install:checked` for an existing lockfile and `deps:add` or
`deps:update` for changes. The latter resolve with `--lockfile-only --ignore-scripts`,
validate all timestamps, then install frozen at root. Their optional
`--workspace packages/<name>` targets an existing non-symlinked workspace directory;
it does not change the validation or installation boundary.

Token-bearing version jobs must not install dependencies. Version preparation and
guard jobs install without restored dependency caches, using cache-disabled Bun
setup. Keep the public packing contract through explicit `publishConfig`
normalization in `pack.ts`, rather than assuming Bun packs like pnpm.

## Invariants

- Dependency code runs only after strict validation. The CLI checks the entire
  lockfile in CI and the guarded helpers; the scanner checks Bun's resolved
  packages before installation. Tests check ordering and failures.
- Workspace selection cannot escape the immediate workspace directories or bypass
  root validation; dependency-helper tests reject invalid and symlinked paths.
- Write-token jobs cannot install dependencies or restore dependency caches;
  version-workflow tests check these boundaries.
- Packed manifests retain publish overrides and resolved workspace/catalog ranges;
  packing tests check the normalized metadata.

## Consequences

With the checked-in configuration, the scanner aborts raw Bun installs if any
scanned package fails validation. The guarded commands and CI keep the explicit
all-lockfile check. Installs require npm metadata lookups and fail if timestamps
cannot be validated. The `packageManager` field pins a
version but has no pnpm-style SHA-512 pin. Manual publish-metadata normalization
must track future changes to Bun and npm packing behavior. This changes repository
tooling, not the published SDK API or semver contract.

## References

- [ADR-2026-05-12: Release PR, publish on push](./ADR-2026-05-12-release-pr-publish-on-push.md).
