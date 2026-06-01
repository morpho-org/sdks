# TIB-2026-05-20: Add Midnight protocol package and Blue-style actions to morpho-sdk

| Field      | Value                                                            |
| ---------- | ---------------------------------------------------------------- |
| **Status** | Proposed                                                         |
| **Date**   | 2026-05-20                                                       |
| **Author** | @0xbulma                                                         |
| **Scope**  | Packages: `@morpho-org/midnight-sdk`, `@morpho-org/morpho-sdk` |

---

## Context

`morpho-sdk` exposes action builders and entities for MarketV1 (Morpho Blue), VaultV1 (MetaMorpho), and VaultV2. The next protocol surface to integrate is **Midnight**: Morpho's fixed-rate, order-driven lending protocol, formerly discussed as MarketV2.

Midnight is not a second version of Blue's pooled variable-rate market. It is organized around fixed-maturity markets where users trade credit and debt units through offers. The current protocol repository (`morpho-org/midnight` `main` at `a7c6da7e70cb216982f6c5d20b46f40b943e67e4`) exposes two contracts needed for Blue-parity user actions:

- `Midnight`
- `MidnightBundles`

The static Midnight protocol surface should not be folded into `@morpho-org/blue-sdk`. `blue-sdk` is the source of truth for Morpho Blue, MetaMorpho, VaultV2, shared Blue-era math, and their address registry. Midnight has its own market type, offer schema, tick/price math, periphery contract, and address lifecycle. Those belong in a dedicated framework-free package, `@morpho-org/midnight-sdk`, then flow through `@morpho-org/morpho-sdk` the same way Blue protocol data flows through `blue-sdk`.

The SDK action vocabulary should remain user-intent oriented and match the Blue-style names integrators already know. Midnight's internal trade primitive is `take(Offer, ...)`, and `Offer.buy` distinguishes buyer/seller roles, but public SDK actions should not force integrators to reason in raw `buy`/`sell` terms for common lending flows.

## Goals / Non-Goals

**Goals**

- Add a new `@morpho-org/midnight-sdk` package that owns the Midnight protocol artifacts required for Blue-parity actions: address registry, ABI literals, constants, value types, pure tick/price math, `Take[]` construction, and typed protocol errors.
- Make `@morpho-org/morpho-sdk` depend directly on `@morpho-org/midnight-sdk` and re-export its public surface through a dedicated `@morpho-org/morpho-sdk/midnight` entrypoint. Avoid root-level Midnight re-exports except for deliberate aliases needed to avoid collisions.
- Add a `midnight/` action and entity instance under `packages/morpho-sdk/src/actions/` and `packages/morpho-sdk/src/entities/`, mirroring the layered shape of `marketV1/`.
- Cover only Midnight operations that correspond to the current `morpho-sdk` MarketV1 action surface: `supplyCollateral`, `withdrawCollateral`, `borrow`, `supplyCollateralBorrow`, `repay`, and `repayWithdrawCollateral`.
- Keep transaction builders and requirement orchestration in `@morpho-org/morpho-sdk`; keep Midnight protocol definitions and reusable pure helpers in `@morpho-org/midnight-sdk`.
- Pin the `Midnight` and `MidnightBundles` ABIs and Base addresses inside `@morpho-org/midnight-sdk`, so no runtime ABI fetch is introduced.
- Reuse Blue's requirement style for prerequisites. `MidnightBundles` authorization is returned by `getRequirements()` as a prerequisite transaction, equivalent to Blue's `morphoAuthorization` requirement for `GeneralAdapter1`. It is not promoted as a user-facing market action.
- Reuse the existing ERC-20 approval / Permit / Permit2 requirement pattern for tokens pulled by `Midnight` or `MidnightBundles`.
- Anvil fork tests on Base at pinned blocks for every promoted action; property-based tests (`fast-check`) on tick/price math and `Take[]` construction; `createMockClient` unit tests for entity requirement reads and validation logic.
- JSDoc on every exported symbol with one realistic `@example` per action (AGENTS.md §6).
- Typed error classes per failure mode (`NoMatchingOffersError`, `PriceAboveMaxError`, `PriceBelowMinError`, `InvalidOfferSideError`, `InvalidCollateralIndexError`, … inside `midnight-sdk` where protocol-shaped) exported from the owning package's `src/index.ts` and re-exported unprefixed from `@morpho-org/morpho-sdk/midnight`. If any of those names are ever re-exported from the `morpho-sdk` root, alias them there only (for example `MidnightPriceAboveMaxError`) to avoid collisions.

**Non-Goals**

- No non-Blue lifecycle operations in this TIB.
- No signature-based Midnight operator authorization in this TIB. Blue's SDK currently returns the plain authorization call as a requirement transaction; Midnight should follow that parity boundary.
- No standalone credit `supply` or `withdraw` action in this TIB. The current `morpho-sdk` MarketV1 action set does not promote standalone Blue supply/withdraw market actions, so Midnight should not add them under a Blue-parity TIB.
- No multi-chain support beyond Base in this TIB. Adding a second chain is an `@morpho-org/midnight-sdk` address-registry change unless the ABI changes.
- No quoter or off-chain orderbook client. `offers` / `takes` are inputs; integrators bring their own quoter. A typed quoter client may be added in a follow-up TIB.
- No `wagmi`/`react` adapters in the core package. Framework adapters land later in `morpho-sdk-wagmi` if needed (AGENTS.md §4).
- No protocol/admin operations. Only Blue-parity user lending actions and their requirement discovery are in scope.
- No changes to `marketV1/`, `vaultV1/`, or `vaultV2/` action shapes. Existing instances are untouched.
- No retroactive `marketV2` rename for `morpho-sdk` routing. The package/folder/subpath is `midnight`.
- No public SDK actions named after raw periphery trade sides such as `buyWithUnitsTarget...` or `supplyCollateralAndSellWith...`. Those remain ABI function names, not consumer-facing SDK action names.
- No Midnight entries in `@morpho-org/blue-sdk` or `@morpho-org/blue-sdk-viem`. Cross-protocol registries are avoided.
- No `@morpho-org/midnight-sdk-viem` package in this TIB. If Midnight later needs reusable fetchers or optional augmentation comparable to `blue-sdk-viem`, that deserves a separate package-level decision.
- No deprecated package updates. This TIB does not require package.json, source, docs, tests, or changeset edits for deprecated workspace packages.

## Current Solution

Today integrators who want Midnight functionality copy periphery calldata construction, tick/price math, and `Take[]` construction from app code or from the Solidity repository. There is no SDK-versioned, fork-tested, JSDoc'd interface, and there is no single package boundary for Midnight's ABI, addresses, constants, or Blue-style transaction flows.

## Proposed Solution

Add a `@morpho-org/midnight-sdk` protocol package and a `midnight/` instance in `morpho-sdk` that follows the established three-layer shape (Client → Entity → Action; AGENTS.md §1). Package ownership is explicit:

- `@morpho-org/midnight-sdk` owns Midnight protocol data and pure protocol helpers.
- `@morpho-org/morpho-sdk` owns transaction builders, client/entity orchestration, requirement discovery, and the dedicated `morpho-sdk/midnight` consumer re-export.

Proposed source shape:

```text
packages/midnight-sdk/src/
├── addresses.ts                  # getChainAddresses(chainId) + Base registry entries
├── abis.ts                       # midnightAbi, midnightBundlesAbi
├── constants.ts                  # protocol constants, WAD, tick bounds, default limits
├── errors.ts                     # NoMatchingOffersError, InvalidOfferSideError, …
├── market.ts                     # Market, CollateralParams helpers and validation
├── offers/
│   ├── buildTakes.ts             # offers + fill target → on-chain Take[]
│   └── types.ts                  # Offer, Take, CollateralSupply, CollateralWithdrawal, TokenPermit
├── priceTick.ts                  # tick↔price, APR/rate↔price helpers, tick snapping
├── types.ts                      # Address/Hex-compatible protocol value types
└── index.ts                      # explicit public barrel
```

```text
packages/morpho-sdk/src/
├── actions/
│   ├── midnight/
│   │   ├── supplyCollateral.ts
│   │   ├── withdrawCollateral.ts
│   │   ├── borrow.ts
│   │   ├── supplyCollateralBorrow.ts
│   │   ├── repay.ts
│   │   ├── repayWithdrawCollateral.ts
│   │   └── index.ts
│   ├── requirements/
│   │   └── getMidnightAuthorizationRequirement.ts
│   ├── marketV1/
│   ├── vaultV1/
│   └── vaultV2/
├── client/
│   ├── blue.ts
│   └── midnight.ts               # client.midnight.market(market)
├── entities/
│   ├── midnight/
│   │   ├── market.ts             # Entity: Blue-style Midnight market actions
│   │   └── index.ts
│   ├── marketV1/
│   ├── vaultV1/
│   └── vaultV2/
└── midnight/
    └── index.ts                  # public @morpho-org/morpho-sdk/midnight barrel
```

Public Midnight surface is isolated behind `@morpho-org/morpho-sdk/midnight`. That subpath re-exports the stable `@morpho-org/midnight-sdk` protocol surface and the `morpho-sdk` Midnight action/entity builders with Blue-style local names:

```ts
import {
  borrow,
  buildTakesFromOffers,
  getChainAddresses,
  midnightBundlesAbi,
  PriceAboveMaxError,
  supplyCollateral,
} from "@morpho-org/morpho-sdk/midnight";
```

The `morpho-sdk` root should not re-export Midnight protocol helpers or unprefixed Midnight actions by default; those stay in the `./midnight` package export. The root may expose namespaced client access (`client.midnight`) and compatibility aliases only. If a root-level export is intentionally added later and collides with an existing root name, the aliasing happens at that boundary only (`midnightBorrow`, `midnightGetChainAddresses`, `MidnightPriceAboveMaxError`, etc.). Do not push those prefixes down into `@morpho-org/midnight-sdk` or `@morpho-org/morpho-sdk/midnight`. No deep imports (AGENTS.md §2.5).

The client API should use protocol namespaces without breaking existing direct Blue methods. New Midnight code should prefer:

```ts
const market = client.midnight.market(midnightMarket);

const supplyCollateralTx = market.supplyCollateral({ userAddress, amount });
const borrowTx = market.supplyCollateralBorrow({
  userAddress,
  borrowAmount,
  collateralSupplies,
  offers,
});
```

Existing `client.marketV1(...)`, `client.vaultV1(...)`, and `client.vaultV2(...)` methods remain compatibility aliases unless a separate deprecation TIB changes them.

**Midnight SDK layer (pure protocol package).** `@morpho-org/midnight-sdk` is framework-free and side-effect-free. It has no client, no RPC reads, no wallet calls, no quoter calls, and no `morpho-sdk` dependency. It exposes only the protocol data and helpers required to build Blue-parity transactions:

- Base address registry through `getChainAddresses(chainId)`, returning `midnight` and `midnightBundles`.
- ABI literals: `midnightAbi` and `midnightBundlesAbi`.
- Protocol types matching the Solidity structs used by Blue-parity actions: `Market`, `CollateralParams`, `Offer`, `Take`, `TokenPermit`, `CollateralSupply`, and `CollateralWithdrawal`.
- `tickToPrice`, `priceToTick`, `snapPriceToTick`, and optional APR/rate helpers that explicitly document their conversion assumptions.
- `buildTakesFromOffers` for constructing `Take[]` from executable offers supplied by an order source.
- Typed errors (`NoMatchingOffersError`, `InvalidOfferSideError`, `PriceAboveMaxError`, `PriceBelowMinError`, …) that protocol helpers can throw and `morpho-sdk/midnight` can re-export.

**Action layer (pure, sync, no I/O).** Each `morpho-sdk` action imports protocol definitions from `@morpho-org/midnight-sdk`, takes resolved inputs (`market`, `userAddress`, amounts, `offers` or `takes`, optional permit data), and returns a deep-frozen `Transaction<MidnightXxxAction>` with `{ to, value, data, action }`. The action discriminant retains a `midnight*` prefix to stay globally unique in `morpho-sdk` transaction unions; callable names under `@morpho-org/morpho-sdk/midnight` stay Blue-style and unprefixed.

| SDK action | Blue analogue | Midnight route | Notes |
| --- | --- | --- | --- |
| `supplyCollateral` | MarketV1 `supplyCollateral` | `Midnight.supplyCollateral` | Direct collateral-only action. |
| `withdrawCollateral` | MarketV1 `withdrawCollateral` | `Midnight.withdrawCollateral` | Direct collateral withdrawal; entity validates health after withdrawal when debt remains. |
| `borrow` | MarketV1 `borrow` | `MidnightBundles.supplyCollateralAndSellWithUnitsTarget` or `supplyCollateralAndSellWithAssetsTarget` with empty `collateralSupplies` | Taker consumes supplier offers where `offer.buy === true`. User receives loan assets and increases debt. |
| `supplyCollateralBorrow` | MarketV1 `supplyCollateralBorrow` | `MidnightBundles.supplyCollateralAndSellWithUnitsTarget` or `supplyCollateralAndSellWithAssetsTarget` with non-empty `collateralSupplies` | Atomic collateral supply + borrow. |
| `repay` | MarketV1 `repay` | `Midnight.repay` | Direct repay in units; entity may expose amount helpers for loan-token assets. |
| `repayWithdrawCollateral` | MarketV1 `repayWithdrawCollateral` | `MidnightBundles.repayAndWithdrawCollateral` | Atomic repay + collateral withdrawal. |

Validation errors are typed classes, never `throw new Error(…)` (AGENTS.md §2.2, §3). Error classes that are purely protocol-shape failures live in `midnight-sdk` with unprefixed names; action-only failures may live in `morpho-sdk/actions/midnight/errors.ts`. `morpho-sdk/midnight` re-exports them unprefixed, and only root-level `morpho-sdk` exports may alias them if needed to avoid collisions.

**Entity layer (reads on-chain state, returns `{ buildTx, getRequirements }`).** Mirrors `MarketV1` entity. `client.midnight.market(market)` returns a `MorphoMidnightMarket` instance with the actions above plus fetchers for market state and user position state. Requirement discovery owns the I/O:

- Bundled `borrow`, `supplyCollateralBorrow`, and `repayWithdrawCollateral` return a `MidnightAuthorizationRequirement` for `MidnightBundles` when the user has not authorized it. This is the Midnight equivalent of Blue's `MorphoAuthorizationAction`; it is not a promoted action method.
- Bundled actions return ERC-20 approval or Permit/Permit2 requirements for the token pulled by `MidnightBundles`.
- Direct `supplyCollateral` and `repay` return ERC-20 approval or Permit requirements for `Midnight`.
- Direct `withdrawCollateral` does not require token approval. If a future delegated `onBehalf` path is added, it should use the same authorization-requirement pattern rather than adding a separate public action.

**Addresses & ABIs.** Add to `@morpho-org/midnight-sdk`'s address module: `midnight` and `midnightBundles` for Base. Pin ABI literals in `@morpho-org/midnight-sdk/src/abis.ts` as `midnightAbi` and `midnightBundlesAbi`. `morpho-sdk` action builders consume these from `midnight-sdk`; no Midnight contract data is added to `blue-sdk`.

**Helpers to implement from the Midnight repository.** Copy semantics from the Solidity repository and re-implement as pure `midnight-sdk` helpers (no React, no quoter calls):

| Solidity source | SDK destination |
| --- | --- |
| `src/interfaces/IMidnight.sol` structs (`Market`, `CollateralParams`, `Offer`) | `packages/midnight-sdk/src/offers/types.ts`, `packages/midnight-sdk/src/market.ts` |
| `src/periphery/interfaces/IMidnightBundles.sol` structs (`Take`, `TokenPermit`, `CollateralSupply`, `CollateralWithdrawal`) | `packages/midnight-sdk/src/offers/types.ts` |
| `src/libraries/TickLib.sol` | `packages/midnight-sdk/src/priceTick.ts` |
| `src/periphery/TakeAmountsLib.sol`, `src/periphery/ConsumableUnitsLib.sol` | `packages/midnight-sdk/src/offers/buildTakes.ts` |

### Implementation Phases

- **Phase 1 — Midnight SDK foundations.** Create `packages/midnight-sdk` with package metadata, TypeScript build config, `src/index.ts`, and package-level `AGENTS.md`. Pin current Midnight ABIs and Base addresses for `Midnight` and `MidnightBundles`. Add protocol types, constants, tick/price math, `Take[]` construction, and typed errors with unit and property-based tests.
- **Phase 2 — morpho-sdk integration and public subpath.** Add `@morpho-org/midnight-sdk` as a direct `morpho-sdk` dependency and explicitly re-export the stable protocol surface from `@morpho-org/morpho-sdk/midnight`. Add `actions/midnight/`, `entities/midnight/`, `client/midnight.ts`, `midnight/index.ts`, a `package.json#exports["./midnight"]` entry, and a `getMidnightAuthorizationRequirement` helper mirroring Blue's `getMorphoAuthorizationRequirement`. Add package-boundary tests that prove `@morpho-org/morpho-sdk/midnight` imports resolve.
- **Phase 3 — Direct Blue-style actions.** Implement `supplyCollateral`, `withdrawCollateral`, and `repay` action builders + entity methods. Add entity requirement reads for token approvals. Fork tests assert collateral accounting, repayment accounting, and health checks after collateral withdrawal.
- **Phase 4 — Bundled borrow actions.** Implement `borrow` and `supplyCollateralBorrow` through `MidnightBundles`. Support both units-target and assets-target modes with discriminated input unions, matching Blue's pattern of one public method with mode-specific parameters. Add approval/Permit/Permit2 requirement handling for loan and collateral tokens plus the `MidnightBundles` authorization requirement. Fork tests cover borrower entry with existing collateral, atomic collateral supply + borrow, partial offer fills, skipped stale offers, and price/slippage bounds.
- **Phase 5 — Repay + collateral exit.** Implement `repayWithdrawCollateral` through `MidnightBundles.repayAndWithdrawCollateral`. Reuse Blue's repay amount-mode discipline where possible while respecting Midnight's units accounting. Fork tests cover partial repay, full repay, collateral withdrawal, and post-action health.
- **Phase 6 — Polish & release.** JSDoc + `@example` audit, TypeDoc generation, JSDoc coverage report, semver-relevant changesets for `@morpho-org/midnight-sdk` and `@morpho-org/morpho-sdk`, migration note ("new Midnight instance, no existing Blue action API changed"). Do not add release entries, dependency bumps, or compatibility edits for deprecated packages.

## Considered Alternatives

### Alternative 1: Put Midnight addresses, ABIs, and constants in `blue-sdk`

Extend `@morpho-org/blue-sdk`'s address registry and ABI surface with Midnight contracts.

**Why rejected:** this makes `blue-sdk` a cross-protocol dumping ground. Midnight has its own address lifecycle, typed-data schema, tick/price math, and periphery contract. Keeping those in `blue-sdk` would blur package ownership, make future Midnight-only changes look like Blue changes, and contradict the "one reason to exist" package rule. A dedicated `midnight-sdk` mirrors the useful part of the `blue-sdk` pattern without coupling unrelated protocols.

### Alternative 2: Folder named `marketV2/` (version-based, matches `marketV1`)

Use the existing version-based naming convention so the folder layout reads as `marketV1`, `marketV2`, `vaultV1`, `vaultV2`.

**Why rejected:** the protocol contracts and repository use the codename `Midnight` consistently (`Midnight`, `MidnightBundles`). Mixing the version label `MarketV2` in SDK exports while the contracts read `Midnight` adds a translation step every integrator has to perform. Documentation can cross-reference the version label ("Midnight, formerly MarketV2") for searchability.

### Alternative 3: Expose raw `buy` / `sell` as the main SDK action names

Mirror the protocol's buyer/seller vocabulary directly in user-facing action names.

**Why rejected:** raw `buy` / `sell` correctly describe `take` internals, but they are worse SDK names for lending users. Blue users already understand `borrow`, `repay`, and collateral verbs. Midnight should preserve that user-intent vocabulary and keep `buy` / `sell` inside calldata and documentation.

### Alternative 4: Add `midnight-sdk-viem` immediately

Create both `@morpho-org/midnight-sdk` and `@morpho-org/midnight-sdk-viem`, matching the Blue split exactly from day one.

**Why rejected:** this TIB does not add reusable Midnight fetchers, optional augmentation, or a read-client package surface. The only network reads are entity-level requirement checks that already belong in `morpho-sdk`. ABI literals and pure protocol helpers can live in `midnight-sdk` without a separate viem package. If Midnight later needs reusable fetchers or augmentation, a follow-up TIB can add `midnight-sdk-viem` with a concrete surface.

### Alternative 5: Add non-Blue lifecycle actions now

Include Midnight-specific lifecycle operations in the first action set.

**Why rejected:** those operations are real Midnight features, but they are not Blue-parity lending actions. Adding them here would expand the surface beyond the requested Blue-style action set and force unrelated lifecycle decisions into the initial integration.

## Assumptions & Constraints

- Midnight stays on Base only for the duration of this TIB. New chain deployments are an address-registry edit in `@morpho-org/midnight-sdk`, not a TIB revision.
- The SDK pins ABIs from the Midnight repository revision used for implementation. If the audited deployment uses a different ABI than `morpho-org/midnight` `main` at `a7c6da7e70cb216982f6c5d20b46f40b943e67e4`, implementation must pin the deployed ABI and document the source.
- The Base address registry must be filled from deployment artifacts for `Midnight` and `MidnightBundles` before merge.
- The order source provides executable offers or takes. Creating or managing offers is out of scope for this TIB.
- `@morpho-org/midnight-sdk` is pure and framework-free. It does not import `react`, `wagmi`, `redux`, or app code. Any dependency it adds must have a package-level reason documented in the PR.
- `viem` remains the only peer dep of `morpho-sdk` (AGENTS.md §4). `morpho-sdk` may add `@morpho-org/midnight-sdk` as a direct workspace dependency and re-export it from `@morpho-org/morpho-sdk/midnight`; application users should not need to install a separate Midnight package for the action flow.
- Deprecated packages stay untouched. Do not apply cross-package cascade bumps or migration/deprecation cleanup as part of this TIB.

## Dependencies

- `@morpho-org/midnight-sdk` (new workspace package) — owns Midnight ABIs, addresses, constants, typed helpers, pure protocol helpers, and typed protocol errors.
- `@morpho-org/morpho-sdk` — depends directly on `@morpho-org/midnight-sdk`, re-exports its stable public surface from `@morpho-org/morpho-sdk/midnight`, and owns action/entity builders.
- `viem ≥ 2.x` (existing `morpho-sdk` peer) — for transaction encoding and entity reads. No version bump expected.
- `@morpho-org/test` — Anvil harness (`createViemTest`, `createAnvilTestClient`) at a pinned Base block.
- `fast-check` — property-based tests for tick/price math and `Take[]` construction in `midnight-sdk`.
- Deprecated workspace packages are not dependencies of this work and must not receive dependency-range updates for it.

## Security

- **Audit dependency.** Fork tests must encode the same `Take[]` and market structs that the live contracts validate; any divergence is a release-blocker. Audit re-verification of the calldata path is included in the next Cantina audit cycle (AGENTS.md §7).
- **Explicit authorization requirement.** `setIsAuthorized(midnightBundles, true)` is surfaced only as a prerequisite transaction from `getRequirements()`, matching Blue's `morphoAuthorization` pattern. It is not granted implicitly inside another action.
- **Bundler skip semantics.** `MidnightBundles` catches failed individual `take` calls and continues to later offers. SDK tests must cover stale/skipped offers and enforce user bounds (`maxAssets`, `minAssets`, `maxUnits`, `minUnits`, price/tick bounds) so a changed fill path cannot silently violate intent.
- **Price/tick invariants.** `borrow` and `supplyCollateralBorrow` enforce the user's max/min price or APR bounds against the matched offer set; a test fails if those bounds are removed (AGENTS.md §5 — security invariants as tests).
- **Health invariants.** `borrow`, `supplyCollateralBorrow`, `withdrawCollateral`, and `repayWithdrawCollateral` validate the resulting borrower position using Midnight's collateral and LLTV rules. Fork tests cover collateral index handling, multi-collateral markets, and post-action health.

## Future Considerations

- A typed quoter client for fetching executable offers or takes from Morpho's off-chain orderbook. Out of scope here.
- A `morpho-sdk-wagmi` extension exposing React hooks for Midnight requirement paths. Out of scope here.
- A future `@morpho-org/midnight-sdk-viem` package if Midnight gains reusable fetchers, deployless reads, or optional augmentation comparable to `blue-sdk-viem`.
- Multi-chain Midnight: once a second deployment exists, add the address entries to `@morpho-org/midnight-sdk`; no SDK action code changes expected unless the ABI changes.
- Liquidation paths, flash loans, callbacks, gate administration, fee administration, and oracle-dependent liquidation flows (separate TIBs).

## Open Questions

- What is the canonical Base deployment address for `MidnightBundles` at the ABI revision this SDK should pin?
- Should `repay` expose units only at first, or also an asset-mode helper mirroring `MidnightBundles.repayAndWithdrawCollateral` fee math?

## References

- Midnight repository: `morpho-org/midnight` `main` at `a7c6da7e70cb216982f6c5d20b46f40b943e67e4`
- Midnight structs and core entrypoints: `src/interfaces/IMidnight.sol`
- Midnight periphery actions: `src/periphery/interfaces/IMidnightBundles.sol`, `src/periphery/MidnightBundles.sol`
- MarketV1 layered pattern (template): `packages/morpho-sdk/src/actions/marketV1/borrow.ts`, `packages/morpho-sdk/src/entities/marketV1/marketV1.ts`
- AGENTS.md §1 (layering), §2 (forbidden patterns), §3 (type discipline), §5 (testing), §6 (JSDoc)
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
