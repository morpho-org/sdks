# TIB-2026-05-18: Migrate `wdk-protocol-lending-morpho-evm` into the SDK monorepo

| Field      | Value                                |
| ---------- | ------------------------------------ |
| **Status** | Proposed                             |
| **Date**   | 2026-05-18                           |
| **Author** | @foulques                            |
| **Scope**  | Repo-wide / Package: `morpho-sdk-wdk` |

---

## Context

[`@morpho-org/wdk-protocol-lending-morpho-evm`](https://github.com/morpho-org/wdk-protocol-lending-morpho-evm) is a Tether [Wallet Development Kit](https://github.com/tetherto/wdk) (WDK) module that bridges WDK EVM accounts (`@tetherto/wdk-wallet`, `@tetherto/wdk-wallet-evm`, `@tetherto/wdk-wallet-evm-erc-4337`) to `@morpho-org/morpho-sdk`. It exposes vault and market lending flows (`supply`, `withdraw`, `borrow`, `repay`, `supplyCollateral`, `withdrawCollateral`, plus matching `quote*` / `get*Requirements`) to WDK consumers.

The package lives in its own repo, is published as `1.0.0-beta.1`, is JavaScript source with hand-written `*.d.ts`, lints with [`standard`](https://standardjs.com), tests with `jest`, and ships a Bare runtime entrypoint (`bare.js`) alongside the Node entrypoint (`index.js`). It depends on pinned versions of `morpho-sdk`, `blue-sdk`, and `blue-sdk-viem`.

Morpho Labs has agreed to take ownership of the module — maintenance, security review, and releases under `@morpho-org/*` — for external WDK consumers. The current repo cannot stay independent without duplicating the monorepo's release flow, audit cadence, dependency graph, and CI surface for one package.

## Goals / Non-Goals

**Goals**

- Move `wdk-protocol-lending-morpho-evm` source, tests, and Bare entrypoint into `packages/morpho-sdk-wdk` in this monorepo.
- Adopt the monorepo's conventions: TypeScript strict, Biome lint/format, Vitest, Changesets, dual ESM/CJS publish, NodeNext resolution per [`AGENTS.md`](../../AGENTS.md) §4 / §8.
- Inherit the monorepo release flow ([TIB-2026-05-12](./TIB-2026-05-12-release-pr-publish-on-push.md)) and security review cadence ([`AGENTS.md`](../../AGENTS.md) §7 Cantina audit).
- Replace pinned `^x.y.z` ranges to `morpho-sdk` / `blue-sdk*` with `workspace:^`.
- Publish the renamed package under `@morpho-org/morpho-sdk-wdk` going forward; deprecate the legacy npm name with a redirect message.
- Preserve the existing WDK-facing public API (method names, requirement-based flow, preset names, return shapes) so existing WDK consumers can migrate by changing the install name only.
- Preserve the Bare runtime entry (`bare` export condition).

**Non-Goals**

- Redesigning the WDK-facing API surface in this TIB. API changes are a follow-up once the package is in-tree and covered by the monorepo's test harness.
- Adding a new framework adapter (React / wagmi) on top of WDK.
- Migrating other `wdk-protocol-*-morpho-*` modules (if/when they exist). This TIB only covers the EVM lending module.
- Unpublishing the legacy `@morpho-org/wdk-protocol-lending-morpho-evm` versions on npm. They get an `npm deprecate` notice only.
- Archiving the source repo before the first `@morpho-org/morpho-sdk-wdk` release ships.

## Current Solution

The standalone repo `morpho-org/wdk-protocol-lending-morpho-evm` ships:

- `index.js` — Node entry, `bare.js` — Bare runtime entry, `src/` — module implementation, `types/` — hand-written `.d.ts` produced by `tsc`, `tests/` — `jest` unit and integration suites, `scripts/check-vault-v2-only.js` — pre-test guard.
- `package.json#dependencies` pinning `morpho-sdk@1.2.1`, `blue-sdk@5.23.2`, `blue-sdk-viem@4.6.5`, `@tetherto/wdk-*@1.0.0-beta.*`, `viem@^2.48.1`.
- Apache-2.0 license, single-package `pnpm-workspace.yaml`, `standard` lint, `jest` test runner with `NODE_OPTIONS=--experimental-vm-modules`.
- No CI release flow comparable to this monorepo's Changesets + trusted-publishing pipeline. No Cantina audit linkage. No fork-test harness (`@morpho-org/test`).

This is incompatible with several rules from [`AGENTS.md`](../../AGENTS.md):

- §3 — JS source instead of strict TypeScript.
- §5 — `jest` instead of Vitest; no fork tests via `@morpho-org/test`.
- §6 — JSDoc coverage on exported symbols is not enforced.
- §7 — no Changesets, no `main`-always-releasable guarantee, no audit cycle tied to majors.
- §8 — `standard` lint instead of Biome; `index.js` deep import structure.

## Proposed Solution

Move the codebase into `packages/morpho-sdk-wdk` and align it with the monorepo conventions in a single PR per phase. The package's job (one reason to exist per §1 Modularity) is: **adapter between WDK accounts and `morpho-sdk` lending flows**. It is a framework adapter in the §1 sense — kept in an explicitly named package, never imported by `morpho-sdk` or other core packages.

### Package name

Rename `@morpho-org/wdk-protocol-lending-morpho-evm` → **`@morpho-org/morpho-sdk-wdk`**.

Rationale:

- Mirrors the `morpho-sdk-<framework>` naming used by other framework adapters in this monorepo (`blue-sdk-viem`, `blue-sdk-wagmi`, `simulation-sdk-wagmi`, `test-wagmi`). The leading scope identifies the SDK family; the trailing token identifies the framework adapter.
- Shorter than the upstream name (44 → 28 chars including scope).
- Drops `protocol-lending-morpho-evm` since "protocol-lending" is the implicit domain of every Morpho SDK package and `evm` is implied by the WDK EVM adapter target. If a non-EVM WDK module is added later, it gets its own package (`morpho-sdk-wdk-<chain-family>`).
- The published package name change requires the legacy name to be deprecated on npm with replacement guidance.

### Source location

```
packages/morpho-sdk-wdk/
  src/
    index.ts
    actions/                  # WDK-facing operation methods
    helpers/                  # preset resolution, requirement encoding
    types/                    # WDK adapter types
  test/                       # initial fork tests via @morpho-org/test
  package.json
  tsconfig.json
  vitest.config.ts
  CHANGELOG.md                # generated by Changesets
  AGENTS.md                   # symlink to CLAUDE.md, package-scoped refinements
  README.md
```

`packages/morpho-sdk-wdk/AGENTS.md` documents WDK-specific terms (`WdkAccount`, `Erc4337Account`, preset registry, requirement objects) and any rule refinements per [`AGENTS.md`](../../AGENTS.md) §6.

### Layering

The adapter respects `Client → Entity → Action` from §1. It does not read state, encode calldata, or hold protocol logic itself: it delegates to `morpho-sdk`. Specifically:

- WDK-facing methods call `morpho-sdk` actions to build `Transaction` objects, then translate them into the WDK account's `sendTransaction` / signature primitives.
- Read paths (`getVaultPosition`, `getMarketPosition`, `getAccountData`) call `morpho-sdk` entity fetchers; they do not duplicate RPC reads.
- Approvals, permits, and authorizations come from `morpho-sdk` requirements; this package never re-encodes them.

This keeps the adapter free of the cross-layer leaks §1 forbids. The WDK module is at the same layer as `blue-sdk-wagmi`: a framework binding that wraps the SDK, not a parallel SDK.

### Build, publish, dependencies

- `package.json#type: "module"`, NodeNext resolution, dual ESM/CJS publish from `lib/esm` / `lib/cjs` per §4. Build script: `tsc --noEmit && pnpm build:cjs && pnpm build:esm`.
- Public exports: `.` (Node), `./bare` (Bare runtime). The `bare` condition is preserved to keep WDK Bare consumers working. No deep imports.
- `"sideEffects": false` per §4. The Bare entry is a separate subpath, not a top-level side effect.
- Workspace ranges replace pinned versions:
  - `@morpho-org/morpho-sdk: workspace:^`
  - `@morpho-org/blue-sdk: workspace:^`
  - `@morpho-org/blue-sdk-viem: workspace:^`
- `viem` stays a peer dependency.
- `@tetherto/wdk-wallet*` stay as direct runtime dependencies. WDK is the package's reason to exist; it is not a peer.
- Changesets entry on every behavior-affecting source change per §7.

### Tooling migration

- Replace `standard` with Biome (root config already applies).
- Replace `jest` with Vitest; reuse `@morpho-org/test` for fork-based integration tests (Anvil pinned per chain per §5).
- Migrate hand-written `types/*.d.ts` into co-located TypeScript source. The published `.d.ts` files come from `tsc`, not from a hand-maintained `types/` folder.
- Replace `scripts/check-vault-v2-only.js` with a Vitest invariant test inside the new package.
- Convert the existing `jest` suites to Vitest one-to-one (no behavior changes). Where the original tests mocked a viem client, replace with an Anvil fork per §5 — no mocked viem clients on RPC paths.

### Public API preservation

The exported WDK adapter surface is preserved one-for-one across the rename so external consumers migrate by changing the install name and import path only:

```
@morpho-org/wdk-protocol-lending-morpho-evm  →  @morpho-org/morpho-sdk-wdk
```

Method names, parameter shapes, return shapes, preset registry, and requirement-based flow stay identical to `1.0.0-beta.1`. Any divergence ships in a separate, post-migration PR with its own changeset.

### Legacy npm deprecation

After `@morpho-org/morpho-sdk-wdk@1.0.0` ships, run on every published version of `@morpho-org/wdk-protocol-lending-morpho-evm`:

```
npm deprecate @morpho-org/wdk-protocol-lending-morpho-evm \
  "Deprecated: renamed to @morpho-org/morpho-sdk-wdk. Install @morpho-org/morpho-sdk-wdk for the maintained Morpho WDK lending adapter."
```

The legacy versions are not unpublished. The standalone source repo is archived (read-only) once the rename is announced.

### Implementation Phases

- **Phase 1 — Drop in source.** Copy `src/`, `tests/`, `bare.js`, `index.js`, and `types/` into `packages/morpho-sdk-wdk/`. Add a minimal `package.json` with name `@morpho-org/morpho-sdk-wdk`, workspace deps, and the dual-export map. CI runs the existing `jest` suite untouched to confirm parity. No public-API changes.
- **Phase 2 — Toolchain alignment.** Convert source to TypeScript (NodeNext, strict). Convert `jest` to Vitest, migrating fork-relevant tests onto `@morpho-org/test`. Replace `standard` with Biome. Delete hand-maintained `types/`; generated `.d.ts` ships from `tsc`. Add `@morpho-org/morpho-sdk-wdk/bare` subpath export; remove root-level `bare.js` / `index.js`. JSDoc backfill on every exported symbol per §6 (initial tier slot; coverage measured by `pnpm jsdoc:coverage`).
- **Phase 3 — First release under new name.** Changesets entry sets the initial version of `@morpho-org/morpho-sdk-wdk` to `1.0.0-beta.2` (continuation of the legacy beta series) and bundles the changelog of upstream `1.0.0-beta.1` for traceability. Trusted-publish via the monorepo release flow.
- **Phase 4 — Deprecate legacy name.** Run the `npm deprecate` command above on every published version of `@morpho-org/wdk-protocol-lending-morpho-evm`. Archive the standalone GitHub repo with a README redirect to `packages/morpho-sdk-wdk` in this monorepo.
- **Phase 5 — Audit alignment.** Include `morpho-sdk-wdk` in the next Cantina audit scope per §7. Document any findings in the package's CHANGELOG at the next major.

## Considered Alternatives

### Alternative 1: Keep the standalone repo, mirror conventions

Leave the codebase in `morpho-org/wdk-protocol-lending-morpho-evm` and replicate the monorepo's Biome / Vitest / Changesets / Cantina pipeline there.

**Why rejected:** Duplicates every release-flow concern, every CI investment from [TIB-2026-05-12](./TIB-2026-05-12-release-pr-publish-on-push.md), and the audit cadence from §7 for a single package. Dependency-range coupling with `morpho-sdk` would still require manual lockstep updates that the monorepo's Changesets cascade ([TIB-0002](./TIB-0002-consolidate-sdk-packages.md) Dependencies §) handles automatically.

### Alternative 2: Keep the package name

Keep `@morpho-org/wdk-protocol-lending-morpho-evm` after the move. No npm rename, no deprecation campaign.

**Why rejected:** The name does not match any other package naming pattern in the monorepo and is the longest published name in the `@morpho-org` scope. The rename cost is paid once; the name appears in every consumer's `package.json` indefinitely.

### Alternative 3: Fold the adapter into `morpho-sdk`

Move the WDK methods directly into `@morpho-org/morpho-sdk` as a `wdk` subpath.

**Why rejected:** Adds `@tetherto/wdk-wallet*` to `morpho-sdk`'s dependency graph, violating §1 ("Framework adapters live in explicitly named packages; core packages stay framework-free") and §4 ("`viem` is the only peer dep of `morpho-sdk`"). It would force every `morpho-sdk` consumer to resolve WDK transitive deps even when they have no WDK integration.

### Alternative 4: Rewrite from scratch as TypeScript in this repo

Discard the upstream source and rewrite the adapter inside the monorepo.

**Why rejected:** Throws away functioning code, tested presets, and the WDK-shaped API that existing beta consumers already use. The migration is a port, not a rewrite; rewriting also delays the release of a maintained `@morpho-org/morpho-sdk-wdk` for no incremental safety gain over Phase-2 TypeScript conversion.

## Assumptions & Constraints

- Morpho Labs takes maintenance ownership for `@morpho-org/morpho-sdk-wdk` going forward (releases, security review, issue triage).
- The Tether WDK packages (`@tetherto/wdk-wallet*`) remain published on the public npm registry. If they move, this package's dependency graph follows them.
- Bare runtime support is part of the public contract. Any change to the `./bare` entry condition is a breaking change per §7.
- `@morpho-org/morpho-sdk-wdk` is a framework adapter, not a core SDK. It is never imported by `morpho-sdk`, `blue-sdk`, `blue-sdk-viem`, or any other core package.
- The legacy `@morpho-org/wdk-protocol-lending-morpho-evm` versions on npm stay published and are reachable via `npm deprecate` redirection only.
- Apache-2.0 is preserved through the move (matches the rest of the monorepo).
- Source migration includes `git log` history preservation via `git filter-repo` or `git subtree`, not a clean copy. PR description must record the merge command used.

## Dependencies

- `@morpho-org/morpho-sdk`, `@morpho-org/blue-sdk`, `@morpho-org/blue-sdk-viem` via `workspace:^`.
- `@tetherto/wdk-wallet`, `@tetherto/wdk-wallet-evm`, `@tetherto/wdk-wallet-evm-erc-4337` as direct runtime deps.
- `viem` as a peer dependency.
- `@morpho-org/test` (dev) for Anvil fork harness in Phase 2.
- `bare-node-runtime` retained only if Bare entry actually needs it at runtime; otherwise removed during Phase 2.

## Security

- Cantina audit scope expands to include `morpho-sdk-wdk` at the next major release per §7.
- The package never re-encodes Morpho calldata; it forwards `morpho-sdk` action outputs. Reviewers must enforce that no encoded calldata, permit signature, or authorization is constructed inside `morpho-sdk-wdk` — only translated to the WDK account API.
- Bare runtime entry must not bypass approval, signature, or authorization requirement objects. The Bare and Node paths share the same requirement flow.
- npm trusted publishing applies once the package is in this monorepo's release workflow ([TIB-2026-05-12](./TIB-2026-05-12-release-pr-publish-on-push.md)).
- The deprecation message on legacy versions is the only post-rename signal external users get; it must be unambiguous (`renamed to @morpho-org/morpho-sdk-wdk`) per the Phase 4 command.

## Observability

- Track npm download trends for `@morpho-org/morpho-sdk-wdk` versus deprecated `@morpho-org/wdk-protocol-lending-morpho-evm` as the migration signal.
- Track support issues mentioning the old package name to gauge when the deprecation message has propagated.
- JSDoc coverage of the migrated surface is measured by `pnpm jsdoc:coverage` per [TIB-2026-05-04](./TIB-2026-05-04-jsdoc-coverage-on-exported-symbols.md).

## Future Considerations

- Non-EVM WDK adapters (`morpho-sdk-wdk-<chain-family>`) follow the same naming and packaging conventions if and when they are needed.
- WDK-side smart-account features (gas sponsorship, paymaster integrations) could ship as additional subpaths once the base adapter is stable.
- React / wagmi hook coverage of WDK accounts is out of scope here and gated on a separate TIB.

## References

- Source repo: [morpho-org/wdk-protocol-lending-morpho-evm](https://github.com/morpho-org/wdk-protocol-lending-morpho-evm)
- Tether WDK: [tetherto/wdk](https://github.com/tetherto/wdk)
- Monorepo engineering rules: [`AGENTS.md`](../../AGENTS.md)
- Release flow: [TIB-2026-05-12](./TIB-2026-05-12-release-pr-publish-on-push.md)
- SDK consolidation context: [TIB-0002](./TIB-0002-consolidate-sdk-packages.md)
- JSDoc bar: [TIB-2026-05-04](./TIB-2026-05-04-jsdoc-coverage-on-exported-symbols.md)
