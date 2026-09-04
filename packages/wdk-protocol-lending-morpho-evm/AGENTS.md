# `@morpho-org/wdk-protocol-lending-morpho-evm` — package rules

Root rules in [`../../AGENTS.md`](../../AGENTS.md) apply. This file records the deviations local to this package and why they are intentional.

## Exact-pinned Morpho runtime dependencies (deviation from root §4)

Root §4 mandates `workspace:^` for workspace runtime dependencies, but authorizes this deviation under its *leaf funds-handling adapter exception*. This package pins its **direct** transaction-building Morpho dependencies with `workspace:*`, which pnpm rewrites to the **exact** tested version at publish time:

- `@morpho-org/morpho-sdk`
- `@morpho-org/blue-sdk`
- `@morpho-org/blue-sdk-viem`

**Why.** This is a leaf integration adapter (nothing in the monorepo depends on it) that resolves vaults/markets, builds requirements, and constructs value-bearing transactions before forwarding them to a writable ERC-4337 wallet account. Exact pins ensure a passive semver minor/patch of a **directly depended-on** transaction-building package can never change calldata, `value`, approvals, or recipients without a deliberate, reviewed release of this adapter. This also aligns these deps with the already exact-pinned `@tetherto/wdk-*` and `bare-node-runtime` runtime deps. (See audit finding SDKS-72.)

**Obligations this creates.**
- Every release that bumps `morpho-sdk`/`blue-sdk`/`blue-sdk-viem` must ship a coordinated patch of this package (root §7 maintained-dependent audit) — with exact pins, skipping it freezes this adapter on a stale version rather than silently drifting forward.
- `workspace:*` always resolves to the current local version, so the published pin tracks the monorepo release; it is not hand-maintained.

**Scope / limits.**
- **Direct deps only, not the transitive graph.** These pins freeze the *direct* Morpho deps. Their own dependencies (e.g. `morpho-sdk` → `morpho-ts`, `blue-sdk`) are still declared `workspace:^` upstream and publish as caret ranges, so a fresh consumer install can resolve a newer compatible transitive version whose helpers (`Time`, `getChainAddress`, …) feed the encoders. A transitive minor can therefore still shift transaction shape without a release of this adapter. Fully closing that requires pinning the whole transaction-shaping graph, which is impractical and out of scope here; the residual is bounded downstream by committed lockfiles and provenance. This measure defends passive drift of the deps this package names directly.
- **Not a control against malicious re-publish** of an already-released version — that is defended downstream by committed lockfiles, integrity digests, `minimumReleaseAgeStrict`, and publish provenance.
- **Error identity across the boundary.** This package lets `morpho-sdk`/`blue-sdk` typed errors propagate uncaught; a consuming app that also installs those packages directly at a range that does not intersect the exact pin could end up with duplicate copies, breaking `instanceof` on errors that cross this boundary. A caret peer dep would keep the singleton but would reopen exactly the passive-drift hole this pin closes, so it is not the trade-off chosen here. Prefer resolving both to a single version via the app lockfile.
