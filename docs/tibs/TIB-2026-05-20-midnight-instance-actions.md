# TIB-2026-05-20: Add Midnight protocol package and MarketV2 actions to morpho-sdk

| Field             | Value                                              |
| ----------------- | -------------------------------------------------- |
| **Status**        | Proposed                                           |
| **Date**          | 2026-05-20                                         |
| **Author**        | @0xbulma                                           |
| **Scope**         | Packages: `@morpho-org/midnight-sdk`, `@morpho-org/morpho-sdk` |

---

## Context

`morpho-sdk` exposes action builders and entities for MarketV1 (Morpho Blue), VaultV1 (MetaMorpho), and VaultV2. The next protocol surface to integrate is **Midnight** — the codename for MarketV2, Morpho's fixed-rate, order-driven lending protocol. Midnight is live on Base (`Midnight` at `0xC6a17cd9d1fa17eec23ab9B4F77950e2FD6478F1`, `MidnightMempool` at `0xd25c7512EA5035bef4F18c708C0862E1B6151765`, `TakeBundler` at `0x487e6263188eFD547F6eFD9491AD902b5173ee72`).

The static Midnight protocol surface should not be folded into `@morpho-org/blue-sdk`. `blue-sdk` is the source of truth for Morpho Blue, MetaMorpho, VaultV2, shared Blue-era math, and their address registry. Midnight is a distinct protocol surface with its own contracts, typed-data schema, rate/tick math, ratifier rules, and future address lifecycle. Those belong in a dedicated framework-free package, `@morpho-org/midnight-sdk`, then flow through `@morpho-org/morpho-sdk` the same way `blue-sdk` is consumed and re-exported there.

A reference UI implementation exists in `morpho-org/morpho-apps`' `markets-v2-app` (action flows at `lib/modules/order/actions/`). Integrators currently re-implement the calldata, EIP-712 typed-data, rate↔tick math, and `Take[]` construction from the app. This duplicates protocol surface logic outside the SDK boundary, where it cannot be audited, fork-tested, or shipped as a versioned contract. Centralizing protocol definitions in `midnight-sdk` and transaction orchestration in `morpho-sdk` follows the same package-boundary justification we used for MarketV1 and VaultV2.

## Goals / Non-Goals

**Goals**

- Add a new `@morpho-org/midnight-sdk` package that owns every Midnight-specific protocol artifact: addresses, ABI literals, constants, value types, pure rate/tick and price math, `Take[]` construction, ratifier data encoding, EIP-712 typed-data builders, and typed protocol errors.
- Make `@morpho-org/morpho-sdk` depend directly on `@morpho-org/midnight-sdk` and re-export its public surface through a dedicated `@morpho-org/morpho-sdk/midnight` entrypoint. Avoid root-level Midnight re-exports except for deliberate aliases needed to avoid collisions.
- Add a new `midnight/` action and entity instance under `packages/morpho-sdk/src/actions/` and `packages/morpho-sdk/src/entities/`, mirroring the layered shape of `marketV1/` and `vaultV2/`.
- Cover four user-facing actions end-to-end: `lendMarket`, `borrowMarket`, `lendLimit`, `borrowLimit`.
- Keep full transaction builders and requirement orchestration in `@morpho-org/morpho-sdk`; keep Midnight protocol definitions and reusable pure helpers in `@morpho-org/midnight-sdk`.
- Pin Midnight ABIs and addresses inside `@morpho-org/midnight-sdk`, so no runtime ABI fetch is introduced.
- Lift these protocol-specific helpers from the app into `@morpho-org/midnight-sdk`, fully unit-tested and named without redundant `midnight` prefixes inside that package: rate↔WAD-price conversion, rate↔tick snapping, `Take[]` builder from offers, `EcrecoverRatifier`/`ApprovalRatifier` data encoders, EIP-712 typed-data builder for limit-order roots.
- Model EIP-712 signing for limit orders via the existing `needsSignature` requirement pattern used for Permit2 in MarketV1: the entity's `getRequirements()` returns a `TypedDataSignatureRequirement`; the caller signs externally; `buildTx({ signature })` consumes it. Action builders remain non-async and contain no signing logic (CLAUDE.md §1, §2.3).
- Anvil fork tests on Base at pinned blocks for every action; property-based tests (`fast-check`) on `midnight-sdk` rate/tick encoders and `Take[]` construction; pure unit tests for typed-data builders; `createMockClient` unit tests for entity requirement reads and validation logic.
- JSDoc on every exported symbol with one realistic `@example` per action (CLAUDE.md §6).
- Typed error classes per failure mode (`NoMatchingOffersError`, `RateBelowMinError`, `InvalidRatifierError`, … inside `midnight-sdk`) exported from the owning package's `src/index.ts` and re-exported unprefixed from `@morpho-org/morpho-sdk/midnight`. If any of those names are ever re-exported from the `morpho-sdk` root, alias them there only (for example `MidnightRateBelowMinError`) to avoid collisions (CLAUDE.md §3).

**Non-Goals**

- No multi-chain support beyond Base in this TIB. Adding a second chain is purely an `@morpho-org/midnight-sdk` address-registry change and does not require revisiting this TIB.
- No quoter/offer fetching. `offers` is an input parameter; integrators bring their own quoter. (A typed quoter client may be added in a follow-up TIB.)
- No `wagmi`/`react` adapters in the core package. Framework adapters land later in `morpho-sdk-wagmi` if needed (CLAUDE.md §4).
- No actions for protocol/admin operations (`setIsAuthorized` self-service excepted, since it is a per-user prerequisite — see Implementation Phase 3).
- No changes to `marketV1/`, `vaultV1/`, or `vaultV2/` action shapes. Existing instances are untouched.
- No retroactive "marketV2" rename for `morpho-sdk` routing. The package/folder/subpath is `midnight`, but public utilities inside `@morpho-org/midnight-sdk` use local unprefixed names because the package name already provides the protocol namespace.
- No Midnight entries in `@morpho-org/blue-sdk` or `@morpho-org/blue-sdk-viem`. Cross-protocol registries are avoided.
- No `@morpho-org/midnight-sdk-viem` package in this TIB. If Midnight later needs reusable fetchers or optional augmentation comparable to `blue-sdk-viem`, that deserves a separate package-level decision.
- No deprecated package updates. This TIB does not require package.json, source, docs, tests, or changeset edits for deprecated workspace packages.

## Current Solution

Today integrators who want Midnight functionality copy `markets-v2-app/lib/modules/order/actions/build*OrderActionFlow.ts` and its utility files into their app. They reimplement the EIP-712 root signing, ratifier calldata, rate/tick math, and `Take[]` construction. There is no SDK-versioned, fork-tested, JSDoc'd interface, and there is no single package boundary for Midnight's ABI, addresses, constants, or typed-data schema.

## Proposed Solution

Add a `@morpho-org/midnight-sdk` protocol package and a `midnight/` instance in `morpho-sdk` that follows the established three-layer shape (Client → Entity → Action; CLAUDE.md §1). Package ownership is explicit:

- `@morpho-org/midnight-sdk` owns Midnight protocol data and pure protocol helpers.
- `@morpho-org/morpho-sdk` owns transaction builders, client/entity orchestration, requirement discovery, and the dedicated `morpho-sdk/midnight` consumer re-export.

Proposed source shape:

```
packages/midnight-sdk/src/
├── addresses.ts                  # getChainAddresses(chainId) + Base registry entries
├── abis.ts                       # marketAbi, mempoolAbi, takeBundlerAbi, ratifier ABIs
├── constants.ts                  # protocol constants, WAD/rate/tick bounds, default limits
├── errors.ts                     # NoMatchingOffersError, …
├── offers/
│   ├── buildTakes.ts             # offers → on-chain Take[]
│   └── types.ts                  # Offer, Take, obligation/value types
├── ratifiers.ts                  # (v,r,s) ↔ EcrecoverRatifier data; ApprovalRatifier path
├── rateTick.ts                   # rate↔tick snapping, rate↔WAD-price
├── typedData.ts                  # OFFER_ROOT_SIGNATURE_TYPES + buildOfferRootTypedData
├── types.ts                      # Address/Hex-compatible protocol value types
└── index.ts                      # explicit public barrel
```

```
packages/morpho-sdk/src/
├── actions/
│   ├── midnight/
│   │   ├── lendMarket.ts         # pure transaction builder, exported as lendMarket from /midnight
│   │   ├── borrowMarket.ts
│   │   ├── lendLimit.ts          # consumes pre-signed EIP-712 root
│   │   ├── borrowLimit.ts        # consumes pre-signed EIP-712 root
│   │   ├── setIsAuthorized.ts    # explicit per-user prerequisite action
│   │   └── index.ts              # barrel
│   ├── blue/                     # optional non-breaking source organization
│   │   ├── marketV1/
│   │   ├── vaultV1/
│   │   └── vaultV2/
│   ├── marketV1/                 # compatibility barrel if moved to actions/blue/marketV1
│   ├── vaultV1/                  # compatibility barrel if moved to actions/blue/vaultV1
│   └── vaultV2/                  # compatibility barrel if moved to actions/blue/vaultV2
├── blue/
│   ├── actions.ts                # public @morpho-org/morpho-sdk/blue/actions barrel if moved
│   └── entities.ts               # public @morpho-org/morpho-sdk/blue/entities barrel if moved
├── client/
│   ├── blue.ts                   # client.blue.market(...), client.blue.vaultV1(...), client.blue.vaultV2(...)
│   └── midnight.ts               # client.midnight.lendMarket(...), client.midnight.borrowMarket(...), …
├── entities/
│   ├── midnight/
│   │   ├── market.ts             # Entity: lendMarket(), borrowMarket(), lendLimit(), borrowLimit()
│   │   └── index.ts
│   ├── blue/                     # optional non-breaking source organization
│   │   ├── marketV1/
│   │   ├── vaultV1/
│   │   └── vaultV2/
│   ├── marketV1/                 # compatibility barrel if moved to entities/blue/marketV1
│   ├── vaultV1/                  # compatibility barrel if moved to entities/blue/vaultV1
│   └── vaultV2/                  # compatibility barrel if moved to entities/blue/vaultV2
└── midnight/
    └── index.ts                  # public @morpho-org/morpho-sdk/midnight barrel
```

Public Midnight surface is isolated behind `@morpho-org/morpho-sdk/midnight`. That subpath re-exports the stable `@morpho-org/midnight-sdk` protocol surface and the `morpho-sdk` Midnight action/entity builders with unprefixed local names:

```ts
import {
  borrowMarket,
  buildTakesFromOffers,
  getChainAddresses,
  lendMarket,
  marketAbi,
  RateBelowMinError,
} from "@morpho-org/morpho-sdk/midnight";
```

The `morpho-sdk` root should not re-export Midnight protocol helpers or unprefixed Midnight actions by default; those stay in the `./midnight` package export. The root may expose namespaced client access (`client.midnight`) and compatibility aliases only. If a root-level export is intentionally added later and collides with an existing root name, the aliasing happens at that boundary only (`midnightGetChainAddresses`, `midnightMarketAbi`, `MidnightRateBelowMinError`, etc.). Do not push those prefixes down into `@morpho-org/midnight-sdk` or `@morpho-org/morpho-sdk/midnight`. No deep imports (CLAUDE.md §2.5).

The client API may move toward protocol namespaces without breaking existing direct methods. New code should prefer `client.blue.market(...)`, `client.blue.vaultV1(...)`, `client.blue.vaultV2(...)`, and `client.midnight.lendMarket(...)` / `client.midnight.borrowMarket(...)` / `client.midnight.lendLimit(...)` / `client.midnight.borrowLimit(...)`. Existing `client.marketV1(...)`, `client.vaultV1(...)`, and `client.vaultV2(...)` methods remain compatibility aliases unless a separate deprecation TIB changes them.

If existing Blue-related source folders are moved under `actions/blue/` or `entities/blue/`, add dedicated package exports for the moved Blue surface:

- `@morpho-org/morpho-sdk/blue/actions` re-exports Blue action builders (`marketV1Borrow`, `vaultV2Deposit`, etc.).
- `@morpho-org/morpho-sdk/blue/entities` re-exports Blue entity classes and entity action interfaces.

The old `marketV1/`, `vaultV1/`, and `vaultV2/` folders must remain as compatibility barrels with identical named exports. The root public API and action names do not change. This reorganization is allowed only as a mechanical, non-behavioral move with package-boundary tests or type checks proving old imports and the new `./blue/actions` / `./blue/entities` imports all resolve.

**Midnight SDK layer (pure protocol package).** `@morpho-org/midnight-sdk` is framework-free and side-effect-free. It has no client, no RPC reads, no wallet calls, no quoter calls, and no `morpho-sdk` dependency. Its public names are local to the package and should not repeat `midnight` unless the on-chain contract name itself requires it in descriptive text. Do not add package-local names like `midnightRateToPrice`, `midnightBuildTakesFromOffers`, `midnightGetChainAddresses`, or `midnightMarketAbi`; use the unprefixed names below. It exposes:

- Base address registry through `getChainAddresses(chainId)`, returning `market`, `mempool`, `takeBundler`, `ecrecoverRatifier`, and `approvalRatifier`.
- ABI literals for the contracts used by the action builders: `marketAbi`, `mempoolAbi`, `takeBundlerAbi`, `ecrecoverRatifierAbi`, and `approvalRatifierAbi`.
- `OFFER_ROOT_SIGNATURE_TYPES` and `buildOfferRootTypedData`.
- Rate/tick/price conversion helpers.
- `buildTakesFromOffers` and the typed `Offer` / `Take` input-output model.
- Ratifier data helpers for EOA and contract-wallet paths.
- Typed errors (`NoMatchingOffersError`, `RateBelowMinError`, `InvalidRatifierError`, …) that protocol helpers can throw and `morpho-sdk/midnight` can re-export.

**Action layer (pure, sync, no I/O).** Each `morpho-sdk` action imports protocol definitions from `@morpho-org/midnight-sdk`, takes the resolved inputs (`obligation`, `accountAddress`, amounts, rate, `offers`, optional `signature` for limit orders), and returns a deep-frozen `Transaction<MidnightXxxAction>` with `{ to, value, data, action }`. The action discriminant may retain a `midnight*` prefix to stay globally unique in `morpho-sdk` transaction unions; the callable names under `@morpho-org/morpho-sdk/midnight` stay unprefixed. The bundler routing matches the app:

- Market orders → `TakeBundler.bundleTake{Buyer,Seller}Assets`
- Limit orders → `MidnightMempool.submit`
- Authorization (one-time per user) → `Midnight.setIsAuthorized`

Validation errors are typed classes, never `throw new Error(…)` (CLAUDE.md §2.2, §3). Error classes that are purely protocol-shape failures live in `midnight-sdk` with unprefixed names; action-only failures may live in `morpho-sdk/actions/midnight/errors.ts`. `morpho-sdk/midnight` re-exports them unprefixed, and only root-level `morpho-sdk` exports may alias them if needed to avoid collisions.

**Entity layer (reads on-chain state, returns `{ buildTx, getRequirements }`).** Mirrors `MarketV1` entity. `getRequirements()` returns the existing requirement union, extended with a `TypedDataSignatureRequirement { domain, types, primaryType, message }` variant for limit orders. The caller signs (via viem `walletClient.signTypedData`, wagmi `useSignTypedData`, or any EIP-712 signer), then calls `buildTx({ signature })`. For contract wallets, the entity instead returns an `ApprovalRatifierRequirement` describing the on-chain `approve(root)` call.

**Addresses & ABIs.** Add to `@morpho-org/midnight-sdk`'s address module: `market`, `mempool`, `takeBundler`, `ecrecoverRatifier`, `approvalRatifier` for Base. Pin ABI literals in `@morpho-org/midnight-sdk/src/abis.ts` as `marketAbi`, `mempoolAbi`, `takeBundlerAbi`, `ecrecoverRatifierAbi`, and `approvalRatifierAbi`. `morpho-sdk` action builders consume these from `midnight-sdk`; no Midnight contract data is added to `blue-sdk`.

**Helpers to lift from the app.** Copy semantics from `markets-v2-app` and re-implement as pure `midnight-sdk` helpers (no React, no quoter calls):

| App file                                                                                          | SDK destination                                      |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `lib/modules/order/actions/market-order.utils.ts → buildTakesFromOffers`                          | `packages/midnight-sdk/src/offers/buildTakes.ts`     |
| `lib/modules/order/actions/limit-order.utils.ts → encodeRatifierDataFromSignature, getRatifierInfo` | `packages/midnight-sdk/src/ratifiers.ts`           |
| `lib/modules/offer/offer.utils.ts → rateToPrice, priceToRate`                                     | `packages/midnight-sdk/src/rateTick.ts`              |
| `lib/modules/offer/tick.utils.ts → snapRateToTick, tickToRate`                                    | `packages/midnight-sdk/src/rateTick.ts`              |
| `lib/modules/order/order.constants.ts → OFFER_ROOT_SIGNATURE_TYPES`                               | `packages/midnight-sdk/src/typedData.ts`             |

### Implementation Phases

- **Phase 1 — Midnight SDK foundations.** Create `packages/midnight-sdk` with package metadata, TypeScript build config, `src/index.ts`, and package-level `AGENTS.md`. Pin Midnight + ratifier + mempool + TakeBundler ABIs and Base addresses there. Add `rateTick`, `buildTakes`, `typedData`, `ratifiers`, value types, constants, and typed errors with full unit and property-based tests.
- **Phase 2 — morpho-sdk integration and source layout.** Add `@morpho-org/midnight-sdk` as a direct `morpho-sdk` dependency and explicitly re-export the stable protocol surface from `@morpho-org/morpho-sdk/midnight`. Add `actions/midnight/`, `entities/midnight/`, `client/midnight.ts`, `midnight/index.ts`, and a `package.json#exports["./midnight"]` entry. If Blue source is reorganized, move implementations under `actions/blue/{marketV1,vaultV1,vaultV2}` and `entities/blue/{marketV1,vaultV1,vaultV2}` while leaving compatibility barrels in the old folders, and add `package.json#exports["./blue/actions"]` plus `package.json#exports["./blue/entities"]`.
- **Phase 3 — Market orders.** Implement `lendMarket` and `borrowMarket` action builders + entity methods. Add the one-time `setIsAuthorized` action + entity requirement if market orders need it. Anvil fork tests on Base at a pinned block: place sample offers, execute, assert balances and emitted events.
- **Phase 4 — Limit orders.** Implement `lendLimit` and `borrowLimit` action builders + the `TypedDataSignatureRequirement` / `ApprovalRatifierRequirement` flow in the entity. Fork tests cover both the EOA (ecrecover) and contract-wallet (approve) paths.
- **Phase 5 — Polish & release.** JSDoc + `@example` audit, TypeDoc generation, JSDoc coverage report, package-boundary tests for `@morpho-org/morpho-sdk/midnight` re-exports, semver-relevant changesets for `@morpho-org/midnight-sdk` and `@morpho-org/morpho-sdk`, migration note ("new Midnight instance, no existing action API changed"). Do not add release entries, dependency bumps, or compatibility edits for deprecated packages.

## Considered Alternatives

### Alternative 1: Put Midnight addresses, ABIs, and constants in `blue-sdk`

Extend `@morpho-org/blue-sdk`'s address registry and ABI surface with `midnight`, `midnightMempool`, `takeBundler`, and ratifier contracts.

**Why rejected:** this makes `blue-sdk` a cross-protocol dumping ground. Midnight has its own address lifecycle, typed-data schema, rate/tick math, and ratifier rules. Keeping those in `blue-sdk` would blur package ownership, make future Midnight-only changes look like Blue changes, and contradict the "one reason to exist" package rule. A dedicated `midnight-sdk` mirrors the useful part of the `blue-sdk` pattern without coupling unrelated protocols.

### Alternative 2: Folder named `marketV2/` (version-based, matches `marketV1`)

Use the existing version-based naming convention so the folder layout reads as `marketV1`, `marketV2`, `vaultV1`, `vaultV2`.

**Why rejected:** the protocol contracts and the markets-v2-app use the codename `Midnight` consistently (`Midnight`, `MidnightMempool`, `EcrecoverRatifier`). Mixing the version label `MarketV2` in SDK exports while the contracts read `Midnight` adds a translation step every integrator has to perform. Documentation cross-references the version label ("Midnight, formerly MarketV2") for searchability.

### Alternative 3: Add `midnight-sdk-viem` immediately

Create both `@morpho-org/midnight-sdk` and `@morpho-org/midnight-sdk-viem`, matching the Blue split exactly from day one.

**Why rejected:** this TIB does not add reusable Midnight fetchers, optional augmentation, or a read-client package surface. The only network reads are entity-level requirement checks that already belong in `morpho-sdk`. ABI literals, typed-data builders, and pure protocol helpers can live in `midnight-sdk` without a separate viem package. If Midnight later needs reusable fetchers or augmentation, a follow-up TIB can add `midnight-sdk-viem` with a concrete surface.

### Alternative 4: Wrap EIP-712 signing inside the action builder

Have the action call `walletClient.signTypedData` internally so callers don't have to thread a signature.

**Why rejected:** violates CLAUDE.md §1 (actions are sync, no I/O) and §2.3 (no signing in transaction builders). It also forces every integrator's transport choice (viem `WalletClient`, wagmi connector, raw EIP-1193, server-side signer) into the SDK surface — exactly the kind of coupling the layered architecture exists to prevent. The `needsSignature` requirement pattern already used for Permit2 is the precedent.

### Alternative 5: Phase the TIB — market orders first, limit orders later

Scope this TIB to `lendMarket` and `borrowMarket` only; defer limit orders to a follow-up TIB so the EIP-712 surface is designed separately.

**Why rejected:** the `needsSignature` requirement pattern already exists in `marketV1` for Permit2, so limit orders are not novel architecture — they are a second consumer of the same pattern. Splitting the TIB would force a second design discussion for what is, structurally, an additional `buildTx` path on the same entity.

## Assumptions & Constraints

- Midnight stays on Base only for the duration of this TIB. New chain deployments are an address-registry edit in `@morpho-org/midnight-sdk`, not a TIB revision.
- The Midnight ABI is stable at the audited revision currently deployed at `0xC6a17cd9d1fa17eec23ab9B4F77950e2FD6478F1`. Any ABI bump before the SDK ships requires re-pinning before merge.
- The `OFFER_ROOT_SIGNATURE_TYPES` EIP-712 schema matches the on-chain `EcrecoverRatifier` verification (verified by Anvil fork tests; mismatch fails the fork test, not production).
- Integrators sign EIP-712 messages externally (viem `walletClient`, wagmi, ethers, etc.). The SDK never calls a wallet method.
- `@morpho-org/midnight-sdk` is pure and framework-free. It does not import `react`, `wagmi`, `redux`, or app code. Any dependency it adds must have a package-level reason documented in the PR.
- `viem` remains the only peer dep of `morpho-sdk` (CLAUDE.md §4). `morpho-sdk` may add `@morpho-org/midnight-sdk` as a direct workspace dependency and re-export it from `@morpho-org/morpho-sdk/midnight`; application users should not need to install a separate Midnight package for the action flow.
- Blue source-folder moves are optional. If included, they are mechanical compatibility-barrel moves only; no Blue action behavior or public name changes ride along with Midnight behavior.
- Deprecated packages stay untouched. Do not apply cross-package cascade bumps or migration/deprecation cleanup as part of this TIB.

## Dependencies

- `@morpho-org/midnight-sdk` (new workspace package) — owns Midnight ABIs, addresses, constants, typed-data helpers, pure protocol helpers, and typed protocol errors.
- `@morpho-org/morpho-sdk` — depends directly on `@morpho-org/midnight-sdk`, re-exports its stable public surface from `@morpho-org/morpho-sdk/midnight`, and owns action/entity builders.
- `viem ≥ 2.x` (existing `morpho-sdk` peer) — for transaction encoding, entity reads, and `signTypedData` typing. No version bump expected.
- `@morpho-org/test` — Anvil harness (`createViemTest`, `createAnvilTestClient`) at a pinned Base block.
- `fast-check` — property-based tests for rate/tick math and `Take[]` construction in `midnight-sdk`.
- Deprecated workspace packages are not dependencies of this work and must not receive dependency-range updates for it.

## Security

- **Audit dependency.** Phase 3 and Phase 4 fork tests must encode the same `Take[]` and EIP-712 root that the live contracts validate; any divergence is a release-blocker. Audit re-verification of the calldata path is included in the next Cantina audit cycle (CLAUDE.md §7).
- **Signature handling.** The SDK accepts a pre-signed `(v, r, s)` and never holds the wallet. No private keys, no signers, no clipboard. Signatures are validated for shape (65 bytes, canonical `s`) before encoding.
- **`setIsAuthorized` is a one-time blanket authorization** of the bundler/mempool on the user's behalf. The entity surfaces it as an explicit requirement with a clear message; it is not granted implicitly inside a market-order or limit-order action.
- **Match-rate invariants.** `lendMarket` / `borrowMarket` enforce `minRate` / `maxRate` bounds against the matched offer set; a test fails if the bound is removed (CLAUDE.md §5 — security invariants as tests).
- **Ratifier mismatch.** EcrecoverRatifier vs. ApprovalRatifier selection is driven by EOA-vs-contract-wallet detection done in the entity. Wrong ratifier on chain reverts — verified by an explicit fork test with a contract wallet (Safe-like) fixture.

## Future Considerations

- A typed quoter client (akin to the existing GraphQL `api/sdk.ts`) for fetching `offers` from Morpho's off-chain orderbook. Out of scope here.
- A `morpho-sdk-wagmi` extension exposing React hooks for the `TypedDataSignatureRequirement` path. Out of scope here.
- A future `@morpho-org/midnight-sdk-viem` package if Midnight gains reusable fetchers, deployless reads, or optional augmentation comparable to `blue-sdk-viem`.
- Multi-chain Midnight: once a second deployment exists, add the address entries to `@morpho-org/midnight-sdk`; no SDK action code changes expected. If a second deployment introduces ABI deltas, supersede this TIB.
- Liquidation paths and oracle-dependent flows on Midnight (separate TIB).

## Open Questions

_None blocking acceptance._ Quoter integration, wagmi adapter, and a possible `midnight-sdk-viem` package are deferred; multi-chain support is an address-registry edit when needed.

## References

- Markets V2 reference app: `morpho-org/morpho-apps/*/apps/markets-v2-app/lib/modules/order/actions/`
- MarketV1 layered pattern (template): `packages/morpho-sdk/src/actions/marketV1/borrow.ts`, `packages/morpho-sdk/src/entities/marketV1/marketV1.ts`
- VaultV2 (most recent comparable instance addition): `packages/morpho-sdk/src/actions/vaultV2/`, `packages/morpho-sdk/src/entities/vaultV2/`
- CLAUDE.md §1 (layering), §2 (forbidden patterns), §3 (type discipline), §5 (testing), §6 (JSDoc)
- [TIB-2026-04-27](./TIB-2026-04-27-maximize-unit-test-coverage.md) (mock-transport unit-test boundary) — applies to helper unit tests here
- [TIB-2026-05-04](./TIB-2026-05-04-jsdoc-coverage-on-exported-symbols.md) (JSDoc coverage on exported symbols) — applies to all new exports here

<!--
TIB conventions:
- Once accepted, do not substantively edit this TIB. If the decision needs to change,
  create a new TIB that supersedes this one and update the Status/Superseded by fields.
- Addenda may be appended to record operational updates that affect
  how the TIB is applied without changing the decision itself.
- TIB identifiers use CalVer (YYYY-MM-DD) based on the date the TIB was first drafted.
- A TIB is a *proposal* until its Status becomes Accepted. Once accepted, the rule the
  TIB decides on is codified in the relevant section of your project's central
  conventions doc (e.g., AGENTS.md or CLAUDE.md); the TIB stays as the dated record
  of how the decision was reached. TIBs feed the conventions doc — they do not
  override it.
-->
