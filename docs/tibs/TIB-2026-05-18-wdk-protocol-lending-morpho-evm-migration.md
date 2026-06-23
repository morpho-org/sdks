# TIB-2026-05-18: Migrate `wdk-protocol-lending-morpho-evm` into the SDK monorepo

| Field      | Value                                                  |
| ---------- | ------------------------------------------------------ |
| **Status** | Accepted                                               |
| **Date**   | 2026-05-18 (updated 2026-05-19)                        |
| **Author** | @foulques                                              |
| **Scope**  | Repo-wide / Package: `wdk-protocol-lending-morpho-evm` |

---

## Context

[`@morpho-org/wdk-protocol-lending-morpho-evm`](https://github.com/morpho-org/wdk-protocol-lending-morpho-evm) is a Tether [Wallet Development Kit](https://github.com/tetherto/wdk) (WDK) module that bridges WDK EVM accounts (`@tetherto/wdk-wallet`, `@tetherto/wdk-wallet-evm`, `@tetherto/wdk-wallet-evm-erc-4337`) to `@morpho-org/morpho-sdk`. It exposes vault and market lending flows (`supply`, `withdraw`, `borrow`, `repay`, `supplyCollateral`, `withdrawCollateral`, plus matching `quote*` / `get*Requirements`) to WDK consumers.

The package lives in its own repo, is published as `1.0.0-beta.1`, is JavaScript source with hand-written `*.d.ts`, lints with [`standard`](https://standardjs.com), tests with `jest`, and ships a Bare runtime entrypoint (`bare.js`) alongside the Node entrypoint (`index.js`). It depends on pinned versions of `morpho-sdk`, `blue-sdk`, and `blue-sdk-viem`.

Morpho Labs has agreed to take ownership of the module — maintenance, security review, and releases under `@morpho-org/*` — for external WDK consumers. The current repo cannot stay independent without duplicating the monorepo's release flow, audit cadence, dependency graph, and CI surface for one package.

## Goals / Non-Goals

**Goals**

- Move `wdk-protocol-lending-morpho-evm` source, tests, and Bare entrypoint into `packages/wdk-protocol-lending-morpho-evm` in this monorepo, **keeping the published name `@morpho-org/wdk-protocol-lending-morpho-evm`** to avoid breaking existing WDK consumers.
- Inherit the monorepo release flow ([TIB-2026-05-12](./TIB-2026-05-12-release-pr-publish-on-push.md)) and security review cadence ([`AGENTS.md`](../../AGENTS.md) §7 Cantina audit) from day one.
- Replace pinned `^x.y.z` ranges to `morpho-sdk` / `blue-sdk*` with `workspace:^`.
- Preserve the existing WDK-facing public API (method names, requirement-based flow, preset names, return shapes) so existing consumers see only an org/maintenance change.
- Preserve the Bare runtime entry (`bare` export condition).
- Plan a phased convergence on the monorepo's conventions (TypeScript strict, Biome lint/format, Vitest, dual ESM/CJS publish, NodeNext resolution per [`AGENTS.md`](../../AGENTS.md) §4 / §8) **without blocking the migration on a full rewrite**. Phase 1 lands the source verbatim; later phases align tooling.

**Non-Goals**

- Redesigning the WDK-facing API surface in this TIB. API changes are a follow-up once the package is in-tree and covered by the monorepo's test harness.
- Adding a new framework adapter (React / wagmi) on top of WDK.
- Migrating other `wdk-protocol-*-morpho-*` modules (if/when they exist). This TIB only covers the EVM lending module.
- Renaming the published package. Earlier drafts of this TIB proposed `@morpho-org/morpho-sdk-wdk`; that rename is dropped in this revision. Existing consumers continue to install `@morpho-org/wdk-protocol-lending-morpho-evm`, and the original npm name keeps publishing from the monorepo.

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

Move the codebase into `packages/wdk-protocol-lending-morpho-evm` and align it with the monorepo conventions over phased PRs. The package's job (one reason to exist per §1 Modularity) is: **adapter between WDK accounts and `morpho-sdk` lending flows**. It is a framework adapter in the §1 sense — kept in an explicitly named package, never imported by `morpho-sdk` or other core packages.

### Package name

**Keep `@morpho-org/wdk-protocol-lending-morpho-evm`.** No rename.

Rationale (revised 2026-05-19):

- The upstream package already shipped a `1.0.0-beta.1` to npm under this name. Renaming would force every WDK consumer to update their `package.json` and re-publish; that cost outweighs the naming-consistency win the original draft proposed.
- The name encodes useful information for WDK consumers searching npm: it pairs the upstream WDK protocol naming convention (`wdk-protocol-<domain>-<provider>-<chain>`) with the Morpho scope.
- A future second WDK adapter (e.g. for a non-EVM chain) follows the same `wdk-protocol-lending-morpho-<chain-family>` pattern rather than the previously-considered `morpho-sdk-wdk-<chain-family>`.

### Source location

```
packages/wdk-protocol-lending-morpho-evm/
  index.js              # Node entry (Phase 1 verbatim, becomes src/index.ts in Phase 2a)
  bare.js               # Bare runtime entry
  src/
    morpho-protocol-evm.js
    morpho-presets.js
  types/
    index.d.ts          # hand-maintained today; auto-generated after Phase 2a
    src/*.d.ts
  tests/
    morpho-protocol-evm.test.js   # unit suite (jest)
    integration/module.test.js    # e2e fork suite (jest)
  scripts/
    check-vault-v2-only.js
  package.json
  tsconfig.json
  CHANGELOG.md          # generated by Changesets
  README.md
  LICENSE
  AGENTS.md             # (Phase 2a) canonical package-scoped rule refinements
  CLAUDE.md             # (Phase 2a) symlink -> AGENTS.md
```

A package-level `AGENTS.md` is added during Phase 2a to capture WDK-specific terminology and any rule refinements per [`AGENTS.md`](../../AGENTS.md) §6. Per the root [`AGENTS.md:5`](../../AGENTS.md), `AGENTS.md` is the **canonical file** at every level and `CLAUDE.md` is the symlink to it (`ln -s AGENTS.md CLAUDE.md`) — not the other way around.

### Layering

The adapter respects `Client → Entity → Action` from §1. It does not read state, encode calldata, or hold protocol logic itself: it delegates to `morpho-sdk`. Specifically:

- WDK-facing methods call `morpho-sdk` actions to build `Transaction` objects, then translate them into the WDK account's `sendTransaction` / signature primitives.
- Read paths (`getVaultPosition`, `getMarketPosition`, `getAccountData`) call `morpho-sdk` entity fetchers; they do not duplicate RPC reads.
- Approvals, permits, and authorizations come from `morpho-sdk` requirements; this package never re-encodes them.

This keeps the adapter free of the cross-layer leaks §1 forbids. The WDK module is at the same layer as `blue-sdk-wagmi`: a framework binding that wraps the SDK, not a parallel SDK.

### Build, publish, dependencies

- `package.json#type: "module"`. Phase 1 keeps the upstream's single ESM build (`tsc --emitDeclarationOnly` for `.d.ts` generation only); dual ESM/CJS publish from `lib/esm` / `lib/cjs` per §4 lands in Phase 2a once the source is TypeScript.
- Public exports: `.` (Node) and an inline `bare` condition pointing at `bare.js` (mirrors the upstream's existing `exports` map). The `bare` condition is preserved to keep WDK Bare consumers working. No deep imports.
- `"sideEffects": false` per §4. The Bare condition is selected by the resolver, not a top-level import.
- Workspace ranges replace pinned versions:
  - `@morpho-org/morpho-sdk: workspace:^`
  - `@morpho-org/blue-sdk: workspace:^`
  - `@morpho-org/blue-sdk-viem: workspace:^`
- `viem` moves from a direct dependency to a peer dependency (matches the rest of the monorepo's framework adapters).
- `@tetherto/wdk-wallet*` stay as direct runtime dependencies. WDK is the package's reason to exist; it is not a peer.
- The published package inherits the monorepo's Changesets-driven release flow ([TIB-2026-05-12](./TIB-2026-05-12-release-pr-publish-on-push.md)) automatically — it is added to `pnpm-workspace.yaml`'s `packages/*` glob, is not `private: true`, and ships under the `@morpho-org` scope, so the `Version PR` and `Publish` workflows pick it up with no extra wiring. The Phase 1 PR includes a `patch` changeset documenting the org/maintenance change so the first monorepo release publishes a version under the same `@morpho-org/wdk-protocol-lending-morpho-evm` name.

### Tooling migration

Phase 1 (this PR) lands the source verbatim. The package is added to the root `pnpm-workspace.yaml` packages glob and uses workspace ranges; everything else stays on the upstream tooling so we land a green baseline before refactoring.

Phase 2a then converges on the monorepo conventions:

- Replace `standard` with Biome (root config already applies). Until then, `packages/wdk-protocol-lending-morpho-evm/{index.js,bare.js,src,tests,types,scripts}` are added to `biome.json#files.includes` exclusions so the upstream `standard`-formatted JS source is not reformatted on commit.
- Replace `jest` with Vitest. Native ESM removes the `NODE_OPTIONS=--experimental-vm-modules` requirement.
- Migrate hand-written `types/*.d.ts` into co-located TypeScript source. The published `.d.ts` files come from `tsc`, not from a hand-maintained `types/` folder.
- Replace `scripts/check-vault-v2-only.js` with a Vitest invariant test inside the new package (test fails if a non-V2 vault preset is added).

### Test migration

Upstream ships two suites that are wired into the same `pnpm test` script today:

- `tests/morpho-protocol-evm.test.js` — 43 unit tests across 8 describe blocks (supply / quoteSupply / withdraw / borrow / repay / collateral / erc-4337 / read methods / read-only accounts). It mocks `viem`, `@morpho-org/morpho-sdk`, and `@morpho-org/blue-sdk-viem` via `jest.unstable_mockModule`. No network, no Anvil.
- `tests/integration/module.test.js` — 1 end-to-end flow against an Anvil fork (mainnet, `MAINNET_RPC_URL`, no block pin) using a hardcoded BIP44 mnemonic and an impersonated whale (USDT). Run separately via `pnpm test:fork`.

Two §5 violations make the suite unfit for CI as-is: **mocked viem clients on RPC paths**, and an **unpinned fork block**. The migration handles them as follows.

- **Unit tests (mocked module path) → split.** Tests that exercise pure helpers (preset resolution, requirement translation, parameter normalization, error mapping, the V2-only invariant) become colocated Vitest unit tests next to source (`src/**/*.test.ts`) with no client mocks. Tests that today only assert "the SDK action was called with X" by mocking `morpho-sdk` are **rewritten as fork tests**: the assertion target moves from "SDK called with X" to "the WDK account received a `Transaction` whose `to`/`data`/`value` decode to the expected Morpho action". Drop the `jest.unstable_mockModule('viem', …)` and `jest.unstable_mockModule('@morpho-org/morpho-sdk', …)` calls entirely — they are exactly what §5 forbids and they prevent the suite from catching SDK regressions.
- **Integration test → harden.** Migrate `tests/integration/module.test.js` to a fork test built on `createViemTest` / `createAnvilTestClient` from `@morpho-org/test`. Pin the block number per chain (mainnet first; matches the convention used by `morpho-sdk`, `migration-sdk-viem`, `liquidity-sdk-viem`). Replace the hardcoded mnemonic with the harness's prefunded test accounts; replace the impersonated USDT whale with `anvil_setBalance` + `anvil_setStorageAt` for ERC-20 balance seeding (already in the test package). Required env vars are read through `morpho-sdk`'s existing zod-validated `env()` helper or its package-local equivalent — `MAINNET_RPC_URL` reuses the root `.env` contract; no new secret surface.
- **ERC-4337 flow.** Currently a single test that mocks the bundler. Keep it as a Vitest unit test with the bundler API stubbed (bundler infrastructure is not a Morpho protocol concern), and add a fork test that exercises the ERC-4337 account's call delegation against an Anvil-deployed EntryPoint when one is available in `@morpho-org/test`. If no EntryPoint fixture exists yet, leave the fork-side ERC-4337 coverage as Phase 6 follow-up rather than expanding the test harness in this TIB.
- **Coverage parity gate.** Phase 1 keeps the suite running under its original jest configuration so the package lands in-tree with a green baseline. Phase 2 then ports tests in two PRs — unit tests first (fast, no infra), fork tests second (Anvil-bound). No test deletion until its Vitest equivalent is green; line/branch coverage on the migrated package source must not drop below the pre-migration jest report attached to the Phase 1 PR.
- **CI surface (Phase 1).** Because the package still runs jest in Phase 1, the root Vitest project does not pick its tests up. The migration adds a dedicated step to `.github/workflows/test.yml` that runs `pnpm --filter @morpho-org/wdk-protocol-lending-morpho-evm test` after the root `pnpm test --coverage` step. The same step runs the e2e fork suite (`tests/integration/module.test.js`) since the upstream wires it into the default `pnpm test` glob; `MAINNET_RPC_URL` is already exported in this job and the existing `maybeDescribe = process.env.MAINNET_RPC_URL ? describe : describe.skip` guard short-circuits gracefully when the secret is missing on fork PRs. After Phase 2b the package's tests fold into the root Vitest project and share the same fork-test path as `morpho-sdk`, `migration-sdk-viem`, `liquidity-sdk-viem`. Re-running fork tests on every dependency bump of `morpho-sdk` / `blue-sdk-viem` is automatic via the workspace dep graph.
- **Property-based tests.** §5 calls for fast-check on calldata encoders. This package does not encode calldata itself (it forwards `morpho-sdk` outputs), so property-based coverage targets the WDK requirement translator instead: arbitrary `Requirement[]` shapes must round-trip to WDK signer calls without dropping items, reordering, or merging approvals that target different spenders. Add this as Phase 2 PR scope, not a follow-up.

### Public API preservation

The exported WDK adapter surface is preserved one-for-one so external consumers see only an org/maintenance change. Method names, parameter shapes, return shapes, preset registry, and requirement-based flow stay identical to `1.0.0-beta.1`. Any divergence ships in a separate, post-migration PR with its own changeset.

### Implementation Phases

- **Phase 1 — Drop in source (this PR).** Copy `src/`, `tests/`, `bare.js`, `index.js`, `types/`, and `scripts/` into `packages/wdk-protocol-lending-morpho-evm/` keeping the upstream layout verbatim. Add a `package.json` that uses workspace ranges for the `@morpho-org/*` deps, removes `viem` from runtime deps in favour of a peer dep, and keeps the upstream `jest` + `cross-env` test runner so the original suite still runs unchanged. Add a step to `.github/workflows/test.yml` that runs `pnpm --filter @morpho-org/wdk-protocol-lending-morpho-evm test` so both the unit and the fork suites execute on every push. Add a changeset entry. The package keeps its published name `@morpho-org/wdk-protocol-lending-morpho-evm`. No public-API changes.
- **Phase 2a — TS + lint + build.** Convert source to TypeScript (NodeNext, strict). Replace `standard` with Biome (drop the `biome.json` exclusions added in Phase 1). Delete hand-maintained `types/`; generated `.d.ts` ships from `tsc`. Dual ESM/CJS publish from `lib/esm` / `lib/cjs` per §4. JSDoc backfill on every exported symbol per §6 (coverage measured by `pnpm jsdoc:coverage`).
- **Phase 2b — Test migration to Vitest.** Port the unit suite first: colocate as `src/**/*.test.ts`, drop every `jest.unstable_mockModule('viem' | '@morpho-org/morpho-sdk' | …)` call, and rewrite "SDK called with X" assertions as `Transaction` decode assertions. Then port the integration suite onto `@morpho-org/test` (`createViemTest` / `createAnvilTestClient`), pin the mainnet block, swap the hardcoded mnemonic for the harness's prefunded accounts and ERC-20 storage seeding helpers. Add fast-check property tests on the requirement translator. Add a vitest project entry for the package in the root `vitest.config.ts`, then retire the Phase-1 jest step from `test.yml`.
- **Phase 3 — Audit + ERC-4337 fork coverage.** Include `wdk-protocol-lending-morpho-evm` in the next Cantina audit scope per §7. Add Anvil-side ERC-4337 fork coverage once an EntryPoint fixture lands in `@morpho-org/test`. Document audit findings in the package's CHANGELOG at the next major.

## Considered Alternatives

### Alternative 1: Keep the standalone repo, mirror conventions

Leave the codebase in `morpho-org/wdk-protocol-lending-morpho-evm` and replicate the monorepo's Biome / Vitest / Changesets / Cantina pipeline there.

**Why rejected:** Duplicates every release-flow concern, every CI investment from [TIB-2026-05-12](./TIB-2026-05-12-release-pr-publish-on-push.md), and the audit cadence from §7 for a single package. Dependency-range coupling with `morpho-sdk` would still require manual lockstep updates that the monorepo's Changesets cascade handles automatically.

### Alternative 2: Rename to `@morpho-org/morpho-sdk-wdk`

Rename the package on the move to match the monorepo's `<scope>/<sdk>-<framework>` adapter naming and shorten the install name (44 → 28 chars including scope).

**Why rejected (2026-05-19, supersedes the original draft):** The upstream package already shipped a `1.0.0-beta.1` to npm under the existing name. A rename forces every WDK consumer to update their `package.json`, and the longer name is the one that already appears in WDK documentation, examples, and partner integrations. The naming-consistency win does not outweigh the consumer migration cost. If a non-EVM WDK adapter is added later, it follows the upstream `wdk-protocol-lending-morpho-<chain-family>` pattern instead of the previously-proposed `morpho-sdk-wdk-<chain-family>`.

### Alternative 3: Fold the adapter into `morpho-sdk`

Move the WDK methods directly into `@morpho-org/morpho-sdk` as a `wdk` subpath.

**Why rejected:** Adds `@tetherto/wdk-wallet*` to `morpho-sdk`'s dependency graph, violating §1 ("Framework adapters live in explicitly named packages; core packages stay framework-free") and §4 ("`viem` is the only peer dep of `morpho-sdk`"). It would force every `morpho-sdk` consumer to resolve WDK transitive deps even when they have no WDK integration.

### Alternative 4: Rewrite from scratch as TypeScript in this repo

Discard the upstream source and rewrite the adapter inside the monorepo.

**Why rejected:** Throws away functioning code, tested presets, and the WDK-shaped API that existing beta consumers already use. The migration is a port, not a rewrite; rewriting also delays the release of a maintained `@morpho-org/wdk-protocol-lending-morpho-evm` for no incremental safety gain over Phase-2 TypeScript conversion.

## Assumptions & Constraints

- Morpho Labs takes maintenance ownership for `@morpho-org/wdk-protocol-lending-morpho-evm` going forward (releases, security review, issue triage).
- The Tether WDK packages (`@tetherto/wdk-wallet*`) remain published on the public npm registry. If they move, this package's dependency graph follows them.
- Bare runtime support is part of the public contract. Any change to the `bare` export condition is a breaking change per §7.
- `@morpho-org/wdk-protocol-lending-morpho-evm` is a framework adapter, not a core SDK. It is never imported by `morpho-sdk`, `blue-sdk`, `blue-sdk-viem`, or any other core package.
- The published npm name is preserved across the move. The first monorepo release continues the upstream version series (`1.0.0-beta.x` → `1.0.0-beta.x+1`).
- The monorepo (`LICENSE` at the root) and every other package in `packages/*` are MIT-licensed. `wdk-protocol-lending-morpho-evm` keeps its upstream Apache-2.0 license through the move and is the **only Apache-2.0 package in the repo**; the per-package `LICENSE` file and `package.json#license` field are the authoritative signal for downstream consumers. This is an intentional, scoped license exception — not a drift toward changing the monorepo's MIT default — and it carries through to the published npm tarball. Any future relicensing (either way) needs its own TIB.
- The Phase 1 PR copies the source from the upstream repo as a clean import rather than a `git subtree` / `git filter-repo` merge. History remains accessible in the archived upstream repo; the PR description links to the upstream commit hash at the time of import for traceability.

## Dependencies

- `@morpho-org/morpho-sdk`, `@morpho-org/blue-sdk`, `@morpho-org/blue-sdk-viem` via `workspace:^`.
- `@tetherto/wdk-wallet`, `@tetherto/wdk-wallet-evm`, `@tetherto/wdk-wallet-evm-erc-4337` as direct runtime deps.
- `viem` as a peer dependency.
- `@morpho-org/test` (dev) for Anvil fork harness in Phase 2.
- `bare-node-runtime` retained only if Bare entry actually needs it at runtime; otherwise removed during Phase 2.

## Security

- Cantina audit scope expands to include `wdk-protocol-lending-morpho-evm` at the next major release per §7.
- The package never re-encodes Morpho calldata; it forwards `morpho-sdk` action outputs. Reviewers must enforce that no encoded calldata, permit signature, or authorization is constructed inside `wdk-protocol-lending-morpho-evm` — only translated to the WDK account API.
- Bare runtime entry must not bypass approval, signature, or authorization requirement objects. The Bare and Node paths share the same requirement flow.
- npm trusted publishing applies as soon as the package is published from this monorepo's release workflow ([TIB-2026-05-12](./TIB-2026-05-12-release-pr-publish-on-push.md)).

## Observability

- Track npm download trends for `@morpho-org/wdk-protocol-lending-morpho-evm` after the org/maintenance change to confirm no regression at the rollover.
- JSDoc coverage of the migrated surface is measured by `pnpm jsdoc:coverage` once Phase 2a converts the source to TypeScript.

## Future Considerations

- Non-EVM WDK adapters follow the upstream `wdk-protocol-lending-morpho-<chain-family>` naming.
- WDK-side smart-account features (gas sponsorship, paymaster integrations) could ship as additional subpaths once the base adapter is stable.
- React / wagmi hook coverage of WDK accounts is out of scope here and gated on a separate TIB.

## References

- Source repo: [morpho-org/wdk-protocol-lending-morpho-evm](https://github.com/morpho-org/wdk-protocol-lending-morpho-evm)
- Tether WDK: [tetherto/wdk](https://github.com/tetherto/wdk)
- Monorepo engineering rules: [`AGENTS.md`](../../AGENTS.md)
- Release flow: [TIB-2026-05-12](./TIB-2026-05-12-release-pr-publish-on-push.md)
