# TIB-2026-05-20: Create a Midnight SDK utility package

| Field      | Value                                      |
| ---------- | ------------------------------------------ |
| **Status** | Accepted                                   |
| **Date**   | 2026-05-20 (updated 2026-06-04)            |
| **Author** | @0xbulma                                   |
| **Scope**  | Package: `@morpho-org/midnight-sdk`        |

---

## Context

Midnight is Morpho's fixed-rate, order-driven lending protocol, formerly discussed as MarketV2. It is not a second version of Blue's pooled variable-rate market. It has its own market struct, offer schema, tick/price math, ratifier model, mempool payloads, and periphery contract.

The current app implementation in `morpho-org/morpho-apps` builds Midnight order flows directly in `apps/markets-v2-app/lib/modules/order/actions`. Those flows already encode useful reusable knowledge:

- market-order borrowing routes through `MidnightBundles.supplyCollateralAndSellWithAssetsTarget`, computes a max-units bound from the user's max rate, reads ERC-20 allowance and `Midnight.isAuthorized`, and optionally emits approval and authorization calls;
- market-order lending routes through `MidnightBundles.buyWithAssetsTargetAndWithdrawCollateral` with an empty `CollateralWithdrawal[]`, computes a min-units bound from the user's min rate, and relies on the bundler's per-take skip semantics;
- supply-only collateral calls `Midnight.supplyCollateral` directly because `MidnightBundles` indexes `takes[0]` and cannot handle an empty take list;
- limit-order flows use router payload encoding, router validation, Ecrecover-vs-Setter ratifier selection, `setIsAuthorized`, offer-root signing or root approval, and mempool submission.

Keeping those details only in app code makes every downstream integration re-learn the same protocol edges. Folding them into `@morpho-org/morpho-sdk` is too premature: the action/entity shape, Blue-parity naming, and release contract for a high-level SDK integration still need more product and protocol mileage. The immediate decision is narrower: create a dedicated `@morpho-org/midnight-sdk` package that owns stable Midnight protocol utilities and can be used by the app today and by higher-level SDK packages later.

## Goals / Non-Goals

**Goals**

- Add `@morpho-org/midnight-sdk` as the source of truth for Midnight addresses, ABI literals, constants, protocol value types, classes, typed errors, and deterministic helper functions.
- Provide utilities that directly support the current markets-v2 app action flows without importing app code: market struct conversion, offer/take conversion, tick/price math, units/assets rounding helpers grouped under utility namespaces, `MidnightBundles` namespaced calldata encoders, requirement planning, Blue-style aggregate fetchers that return populated classes, and make-offer signature/validation helpers.
- Keep the package framework-free: no React, wagmi, Redux, app router state, UI action-flow types, or app-specific error classes.
- Keep I/O isolated in explicit boundary modules such as `fetch/` and `router/`. Requirement planners stay pure once current state is supplied, and pure protocol helpers remain testable without mocks.
- Pin the Midnight ABI surface in package source and expose an address-registry contract for `Midnight`, `MidnightBundles`, `MidnightMempool`, `EcrecoverRatifier`, `SetterRatifier`, and Permit2. Production addresses are added only when reviewed deployment artifacts are available.
- Export typed errors for integrators to pattern-match on instead of throwing plain `Error`.
- Cover the package with colocated unit tests, property-based tests for tick/price and unit/asset conversion, and viem mock-transport tests for aggregate fetchers and requirement readers.

**Non-Goals**

- No `@morpho-org/morpho-sdk` source, package export, action, entity, or dependency changes in this TIB.
- No Blue-style `client.midnight.market(...)` instance in this TIB.
- No Blue protocol-surface changes. Any Blue edits are limited to shared primitive compatibility, such as re-exporting shared `MathLib`.
- No React, wagmi, app `ActionFlow`, toast, label, analytics, or UI-state abstractions in `midnight-sdk`.
- No quoter or orderbook client in this package. The package can define quote/take input shapes and build on-chain `Take[]`, but executable offers still come from the app or a future orderbook SDK.
- No protocol/admin operations beyond utility support for user-facing order, requirement, fetch, and signature flows.
- No standalone `MidnightCalls` namespace or individual direct core-call encoders. One-wrapper-per-Solidity-function calldata utilities are not a useful SDK surface; direct `Midnight` calls should be produced by the higher-level helper that owns the workflow, or stay app-local until a higher-level action/entity surface exists.
- No exported one-wrapper-per-Solidity-function fetchers. Public fetchers should return populated SDK classes or grouped requirement-input classes, not loose primitive values from individual protocol getters.
- No runtime ABI fetch. ABI literals and address-registry fields are pinned in source; production address values are added only from reviewed deployment artifacts.
- No deprecated package updates.

## Current Solution

Today Midnight utilities are spread across the Solidity repository and the markets-v2 app:

- `morpho-org/midnight` owns the canonical Solidity structs, constants, tick math, periphery routing, and ratifier contracts.
- `morpho-org/morpho-apps` re-implements address lookup, app market-to-Solidity struct conversion, take construction, allowance and authorization reads, approval and authorization call building, units/assets rounding, ratifier selection, router payload validation, signatures, root approval, and mempool submission.

That works for one app, but it is not an SDK-versioned contract. It also encourages plain app errors, duplicated rounding rules, repeated authorization logic, and future drift between app code and the deployed contracts.

## Proposed Solution

Create `packages/midnight-sdk` as a focused Midnight protocol utility package. The package should be small, side-effect-free at top level, and explicit about the boundary between pure helpers and I/O helpers.

Accepted source shape:

```text
packages/midnight-sdk/
+-- AGENTS.md
+-- package.json
+-- tsconfig*.json
+-- src/
    +-- abis.ts
    +-- addresses.ts
    +-- constants.ts
    +-- errors.ts
    +-- index.ts
    +-- types.ts
    +-- market/
    |   +-- CollateralParams.ts
    |   +-- Market.ts
    |   +-- MarketState.ts
    |   +-- MarketUtils.ts
    |   +-- Position.ts
    |   +-- index.ts
    +-- offers/
    |   +-- Offer.ts
    |   +-- OfferStatus.ts
    |   +-- Take.ts
    |   +-- OfferUtils.ts
    |   +-- index.ts
    +-- math/
    |   +-- ConsumableUnitsLib.ts
    |   +-- TakeAmountsLib.ts
    |   +-- TickLib.ts
    |   +-- index.ts
    +-- bundles/
    |   +-- MidnightBundles.ts
    |   +-- index.ts
    +-- fetch/
    |   +-- Market.ts
    |   +-- Position.ts
    |   +-- OfferStatus.ts
    |   +-- RequirementInputs.ts
    |   +-- index.ts
    +-- router/
    |   +-- MidnightRouterApi.ts
    |   +-- index.ts
    +-- requirements/
    |   +-- approval.ts
    |   +-- authorization.ts
    |   +-- requirements.ts
    |   +-- orderPlans.ts
    |   +-- index.ts
    +-- signatures/
        +-- OfferPayloadUtils.ts
        +-- Payload.ts
        +-- RatifierUtils.ts
        +-- index.ts
```

The root barrel exports the stable package surface explicitly, including `MarketUtils`,
`OfferUtils`, `TickLib`, `TakeAmountsLib`, `ConsumableUnitsLib`, `MidnightBundles`,
`Payload`, `MidnightRouterApi`, `MIDNIGHT_SDK_VERSION`, typed errors such as
`InvalidOfferGroupError`, aggregate class fetchers such as `fetchMarket`, `fetchPosition`, and
`fetchOfferStatus`, grouped requirement-input fetchers, and their supporting parameter types. The
initial implementation keeps viem-backed aggregate fetch helpers in the root export; a separate
`./viem` subpath or package can be introduced later if the I/O surface grows.

### Contract Data

`addresses.ts` owns the immutable registry shape for these deployment entries:

- `midnight`
- `midnightBundles`
- `midnightMempool`
- `ecrecoverRatifier`
- `setterRatifier`
- `permit2`

The initial registry is intentionally empty until a reviewed deployment artifact pins production
addresses. `registerCustomMidnightAddresses` supports local, fork, and test deployments; unknown
chains must provide every required address, and registered values cannot be overwritten with a
different address.

The public helper should be named around the protocol rather than the app codename:

```ts
const addresses = getMidnightAddresses(chainId);
```

`abis.ts` owns pinned ABI literals:

- `midnightAbi`
- `midnightBundlesAbi`
- `erc20Abi` for allowance reads
- `ecrecoverRatifierAbi`
- `setterRatifierAbi`

Mempool submission remains a raw `to` + payload call descriptor rather than an ABI-backed
`midnightMempoolAbi`. Each pinned ABI literal documents the `morpho-org/midnight` source commit and
artifact path. Runtime ABI fetches are out of scope.

### Types, Classes, and Constants

`midnight-sdk` should model the Solidity structs and fetchable domain aggregates as readonly
TypeScript types/classes:

- `Market`
- `CollateralParams`
- `Offer`
- `OfferStatus`
- `Take`
- `TokenPermit`
- `CollateralSupply`
- `CollateralWithdrawal`
- `MarketState`
- `Position`
- `RatifierInfo`
- `MidnightAddresses`
- `MidnightAddressRegistry`
- quote-facing raw input shapes for converting app/router responses into `Offer` and `Take`

`midnight-sdk` exports Midnight-specific constants that app actions currently need or will need to
validate inputs:

- `CBP`
- `MAX_TICK`
- `PRICE_ROUNDING_STEP`
- `DEFAULT_TICK_SPACING`
- `MAX_COLLATERALS`
- `MAX_COLLATERALS_PER_BORROWER`
- `MAX_OFFERS_PER_TREE`
- allowed LLTV tiers
- max settlement fee constants
- max continuous fee and liquidation cursor constants
- HashLib typehash constants for markets, collateral params, offers, and the EIP-712 domain
- `PermitKind`

Generic constants and primitives such as `MathLib.WAD`, `ORACLE_PRICE_SCALE`,
`UnsupportedChainIdError`, `NegativeValueError`, `assertNonNegative`, and `deepFreeze` live in
`@morpho-org/morpho-ts`; `midnight-sdk` consumes them instead of duplicating them. Permit2 is a
deployment-registry field rather than a standalone `PERMIT2_ADDRESS` constant.

Classes copy nested values, convert `BigIntish` inputs to `bigint`, deep-freeze public state, and
expose `from(...)` factories and `toStruct()` helpers for ABI-compatible objects. Constructors and
pure class methods must not fetch or sign. Fetchers populate class fields the way `blue-sdk-viem`
fetchers populate `blue-sdk` classes: callers should receive a useful aggregate class, not a bag of
primitive protocol reads they have to stitch together themselves. Plain interfaces may still be
exported for call sites that already have normalized data.

For fetched aggregates, model complete domain state as class fields:

- `fetchMarket` returns a `Market` with its id, market struct fields, and a populated `MarketState`
  containing total units, loss factor, withdrawable assets, continuous-fee credit, settlement-fee
  cbps, continuous fee, and tick spacing.
- `fetchPosition` returns a `Position` with user, market id, credit, pending fee, last loss factor,
  last accrual, debt, collateral bitmap, and the full collateral array populated.
- `fetchOfferStatus` returns an `OfferStatus` with the offer, consumed amount, computed consumable
  units when requested, the settlement fee used for that computation, ratifier route, and root
  ratification/cancellation state when requested.

### Utility Libraries and Namespaces

Pure helpers should follow the same naming shape as `blue-sdk`: Solidity libraries get TypeScript
`*Lib` namespaces with exact method names where the helper mirrors onchain behavior, and SDK-only
derived helpers live in domain `*Utils` namespaces. Narrow SDK conveniences may live in an
onchain-named library only when they are clearly part of that library's domain and are documented as
SDK additions. Do not create a broad `Midnight` namespace that mixes market math, offers,
signatures, and calldata, and do not create a `MidnightCalls` namespace that simply mirrors direct
core contract entrypoints one by one.

Expose deterministic library methods:

- `TickLib.tickToPrice`
- `TickLib.priceToTick`
- `TickLib.snapPriceToTick`
- `TickLib.rateToPrice`
- `TickLib.tickToRate`
- `TakeAmountsLib.buyerAssetsToUnits`
- `TakeAmountsLib.sellerAssetsToUnits`
- `TakeAmountsLib.toUnits` for SDK-only generic unit conversion convenience
- `TakeAmountsLib.toUnitsAtTick` for SDK-only tick-priced unit conversion convenience
- `ConsumableUnitsLib.consumableUnits`

SDK-only derived helpers should live beside the domain they describe:

- `TickLib.assertTickAlignedToSpacing` as an SDK assertion attached to the tick domain
- `MarketUtils.getMaxSettlementFee`
- `MarketUtils.isLltvAllowed`
- `MarketUtils.getMaxLif`
- `OfferUtils.getOfferExpiry`

The pure helpers that mirror `TakeAmountsLib` should accept `settlementFee` as an explicit input instead of reading the chain. Fetching settlement fee remains a boundary concern; fetch helpers that compute it should accept `timeToMaturity` directly so callers do not confuse wall-clock time with Solidity's `block.timestamp`.

Rounding names should match local SDK convention: `"Up"` and `"Down"`. Tests must cover the app-known boundary cases:

- borrow market orders round max units up for `MidnightBundles.supplyCollateralAndSellWithAssetsTarget`;
- lend market orders round min units down for `MidnightBundles.buyWithAssetsTargetAndWithdrawCollateral`;
- `TickLib` prices are rounded to `PRICE_ROUNDING_STEP`;
- `TickLib.priceToTick` returns the lowest spacing-aligned tick with price greater than or equal to the input price.

### Offer and Take Utilities

`OfferUtils.buildTakesFromOffers` should replace the app-local conversion in
`market-order.utils.ts`. It should:

- accept router/app quote entries that include `units`, `ratifierData`, and the inline offer;
- copy address and hex fields into ABI-compatible objects;
- convert numeric string fields to `bigint`;
- produce the on-chain `Take` shape: `{ units, offer, ratifierData }`;
- reject an empty input with a typed `NoMatchingOffersError`;
- validate offer side where the caller expects one side (`buy` offers for borrower market-orders, `sell` offers for lender market-orders);
- validate a consistent market when callers choose to enforce it before encoding a bundle.

Make-offer helpers should support the limit-order path without importing app code:

- `OfferUtils.buildOffer` builds `Offer` values from market, side, tick, max assets, expiry, group, callback, receiver, and ratifier inputs;
- generate or accept a group id via an injected random byte source;
- `OfferUtils.buildOfferGroup` builds multiple offers with one shared group id, preserving order and validating only protocol group mechanics;
- `OfferUtils.validateOfferGroup` enforces non-empty groups, same maker, same group, same side, same unit/asset caps with exactly one non-zero cap, and same loan token;
- expose offer payload, Merkle root, proof, ratifier-data, root-approval, mempool-submission, and router-validation helpers behind stable SDK functions;
- validate maker payloads through `MidnightRouterApi.validateMempoolPayload` or `MidnightRouterApi.validateMempoolItems`; the implementation uses a lightweight `fetch` boundary and does not add a runtime `@morpho-dev/router` dependency;
- keep offer publication/submission onchain through `OfferPayloadUtils.buildMempoolSubmissionCall`; the current Router API does not expose a submit endpoint.
- do not add router gatekeeper policy to the protocol helpers: no ratifier allowlists, content-addressed group requirement, full-payload inclusion rule, same-ratifier tree policy, minimum duration, callback policy, or validation timestamp logic.

### MidnightBundles Namespace

The package should centralize every `MidnightBundles` periphery encoder in one namespace, mirroring
the `BundlerAction` pattern used by existing Morpho bundle encoders. The namespace is the public API;
do not export free-floating `build*Call` functions for individual periphery routes.

```ts
export namespace MidnightBundles {
  export function buyWithUnitsTargetAndWithdrawCollateral(
    params: BuyWithUnitsTargetAndWithdrawCollateralParams,
  ): MidnightCall;

  export function supplyCollateralAndSellWithUnitsTarget(
    params: SupplyCollateralAndSellWithUnitsTargetParams,
  ): MidnightCall;

  export function buyWithAssetsTargetAndWithdrawCollateral(
    params: BuyWithAssetsTargetAndWithdrawCollateralParams,
  ): MidnightCall;

  export function supplyCollateralAndSellWithAssetsTarget(
    params: SupplyCollateralAndSellWithAssetsTargetParams,
  ): MidnightCall;

  export function repayAndWithdrawCollateral(
    params: RepayAndWithdrawCollateralParams,
  ): MidnightCall;
}
```

The namespace methods should use the Solidity entrypoint names because the periphery contract does
not expose a generic multicall-style action dispatcher. Each method returns a neutral call
descriptor:

```ts
interface MidnightCall {
  readonly to: Address;
  readonly data: Hex;
}
```

The namespace should cover the five public periphery entrypoints exactly:

| Namespace method | Solidity entrypoint |
| --- | --- |
| `MidnightBundles.buyWithUnitsTargetAndWithdrawCollateral` | `buyWithUnitsTargetAndWithdrawCollateral` |
| `MidnightBundles.supplyCollateralAndSellWithUnitsTarget` | `supplyCollateralAndSellWithUnitsTarget` |
| `MidnightBundles.buyWithAssetsTargetAndWithdrawCollateral` | `buyWithAssetsTargetAndWithdrawCollateral` |
| `MidnightBundles.supplyCollateralAndSellWithAssetsTarget` | `supplyCollateralAndSellWithAssetsTarget` |
| `MidnightBundles.repayAndWithdrawCollateral` | `repayAndWithdrawCollateral` |

### Direct Core Calls

The package should not expose direct core contract encoders under a `MidnightCalls` namespace.
Individual encoders such as `supplyCollateral`, `withdrawCollateral`, `repay`, `setIsAuthorized`,
and `setConsumed` only mirror the Solidity ABI one function at a time, so they do not add enough SDK
value to be public API.

When a higher-level Midnight helper needs a direct core call, that helper owns the neutral call
descriptor it returns. Examples:

- authorization requirement planners may return a `setIsAuthorized` descriptor because the
  authorization requirement owns that workflow;
- offer payload helpers may return root approval, root cancellation, and mempool submission call
  descriptors because those calls are part of the offer-publication workflow;
- direct supply/withdraw/repay flows remain app-local or move to a future high-level
  `morpho-sdk`/Midnight action surface once action and entity names are settled.

### Fetch Methods

Fetch helpers live in `src/fetch/` and are the only modules that read chain state. They accept a
viem `Client` or a minimal reader interface and use named `viem/actions` imports, so tests can use
`createMockClient` from `@morpho-org/test/mock`.

Public fetchers should follow the `blue-sdk-viem` pattern: fetch by domain aggregate and return an
exported class with its fields populated. Primitive protocol reads may exist as private
implementation details, but they should not be exported as public helpers. Do not export
`fetchCollateral`, `fetchCredit`, `fetchDebt`, `fetchWithdrawable`, `fetchTickSpacing`,
`fetchSettlementFee`, `fetchConsumed`, `fetchIsAuthorized`, `fetchErc20Allowance`,
`fetchIsRootCanceled`, `fetchIsRootRatified`, or similar one-function wrappers.

Initial public aggregate fetchers:

- `fetchMarket`, which reads the market struct and market state and returns a populated `Market`.
  The caller should not need separate public `fetchMarketId`, `fetchMarketState`,
  `fetchWithdrawable`, `fetchTickSpacing`, or settlement-fee getter wrappers.
- `fetchPosition`, which reads the position and required collateral slots and returns a populated
  `Position`. The caller should not need separate public `fetchCollateral`, `fetchCredit`, or
  `fetchDebt` wrappers.
- `fetchOfferStatus`, which reads consumed amount, the settlement-fee context needed for
  `ConsumableUnitsLib`, maker bytecode, and optional root state, then returns `OfferStatus`.
  Ratifier classification must preserve the EIP-7702 designator rule from the app: no code, `0x`, or
  `0xef0100...` routes through Ecrecover; other code routes through Setter.
- grouped requirement-input fetchers such as `fetchBorrowMarketOrderRequirementInputs`,
  `fetchLendMarketOrderRequirementInputs`, `fetchSupplyCollateralRequirementInputs`, and
  `fetchMakeOfferRequirementInputs`. These gather allowance, authorization, settlement-fee,
  consumed, ratifier, root, signature, and validation state as needed for their planner and return a
  typed class/value object for that planner, not loose primitive reads.

Fetch helpers must not mutate state, sign, submit transactions, or import UI/app code.

### Requirement Plans

The package should provide requirement planning utilities that return neutral descriptors. Apps can render those descriptors into their own `ActionFlow`, while future SDKs can map them to their own transaction requirement types.

Initial requirement types:

```ts
type MidnightRequirement =
  | MidnightApprovalRequirement
  | MidnightAuthorizationRequirement
  | MidnightSignatureRequirement
  | MidnightRootApprovalRequirement
  | MidnightPayloadValidationRequirement;
```

Initial planners:

- `planApprovalRequirement` from required amount and current allowance;
- `planAuthorizationRequirement` from authorizer, authorized contract, and current `isAuthorized`;
- `planBorrowMarketOrderRequirements` for collateral approval to `MidnightBundles` and bundler authorization;
- `planLendMarketOrderRequirements` for loan-token approval to `MidnightBundles` and bundler authorization;
- `planSupplyCollateralRequirements` for collateral approval to the core Midnight contract;
- `planMakeOfferRequirements` for optional delegated signer/operator authorization, Ecrecover signature, Setter root approval, and payload validation.

Requirement planners should be pure once their current state inputs are supplied. Companion grouped
`fetch...RequirementInputs` helpers may gather current allowance, authorization, settlement fee,
consumed amounts, root state, and ratifier info, but they return a planner-specific input aggregate
rather than exporting individual allowance, authorization, or root-status fetchers.

### Signatures, Payloads, and Router Validation

Make-offer flows need reusable utilities, but the SDK should not own a wallet or a UI wizard. It should expose grouped helpers:

- `RatifierUtils.getRatifierInfo`
- `OfferPayloadUtils.buildOfferPayload`
- `OfferPayloadUtils.buildOfferTreeRoot`
- `OfferPayloadUtils.buildOfferProof`
- `OfferPayloadUtils.buildEcrecoverRatificationTypedData` or `OfferPayloadUtils.signEcrecoverRatification` with an injected `signTypedData` callback;
- `OfferPayloadUtils.encodeEcrecoverRatifierData`
- `OfferPayloadUtils.encodeSetterRatifierData`
- `OfferPayloadUtils.decodeEcrecoverRatifierData`
- `OfferPayloadUtils.decodeSetterRatifierData`
- `OfferPayloadUtils.verifyOfferProof`
- `OfferPayloadUtils.buildEcrecoverRootCancellationCall`
- `OfferPayloadUtils.buildSetterRootApprovalCall`
- `OfferPayloadUtils.buildMempoolSubmissionCall`
- `Payload.encode` / `Payload.decode` for versioned Midnight mempool payload bytes.
- `MidnightRouterApi.validateMempoolPayload` for `POST /v1/midnight/mempool/validate`.
- `MidnightRouterApi.validateMempoolItems`, which encodes `Payload.Item[]` with `Payload.encode` before validation.
- `MidnightRouterApi.fetchMempoolRules` for `GET /v1/midnight/mempool/rules`.

The app remains responsible for sequencing prompts. The SDK returns typed descriptors for "sign this typed data", "call this contract", "submit this payload", and "validate this payload". `Payload` encodes and decodes the raw mempool wire format as `version || uint32(gzipLen) || gzip(abi(items))`, with bounded compressed bytes, bounded decoded bytes, a small attribution-suffix allowance, canonical ABI-byte validation, and a typed `Payload.DecodeError`.

`MidnightRouterApi` is the router HTTP boundary. It accepts an optional `baseUrl`, injected `fetch`, and `request` options for headers, abort signals, credentials, cache, and similar fetch settings. SDK-controlled fields remain fixed: URL path/query, HTTP method, JSON body, `Content-Type: application/json` on POST requests, and an exact `sdk-version` header equal to the `@morpho-org/midnight-sdk` package version. Validation returns SDK camelCase data `{ payload, valid, issues }`, where `valid` is derived from `issues.length === 0`. Rules are returned as `{ cursor, data }` with camelCase fields such as `chainId`, `callbackType`, `minTick`, `tickSpacing`, and `allowedLltvs`.

The current Router API exposes Books, Maker takes, Mempool validate, and Mempool rules. This TIB implements only the maker-relevant validation/rules endpoints first. No generator is introduced for now because the SDK only needs lightweight API calls; type names stay close to the OpenAPI schema names so a future dev-only generator can replace or verify them if a stable spec URL appears.

### App Action Mapping

The package should make these current app flows straightforward without becoming app-specific:

| Current app flow | Midnight SDK support |
| --- | --- |
| Borrow market order with collateral | `TickLib.rateToPrice`/tick helpers, `TakeAmountsLib` max-units rounding, `OfferUtils.buildTakesFromOffers`, `planBorrowMarketOrderRequirements`, `MidnightBundles.supplyCollateralAndSellWithAssetsTarget` |
| Borrow against existing collateral | Same bundle call with empty `CollateralSupply[]`; skip collateral allowance planning when collateral amount is zero |
| Supply collateral only | `planSupplyCollateralRequirements`; direct `Midnight.supplyCollateral` encoding stays app-local until a higher-level action surface exists |
| Lend market order | `TakeAmountsLib` min-units rounding, `planLendMarketOrderRequirements`, `MidnightBundles.buyWithAssetsTargetAndWithdrawCollateral` with empty withdrawals |
| Borrow limit order | optional app-local collateral supply call, `OfferUtils.buildOffer` with `buy: false`, `RatifierUtils`, `MidnightRouterApi`, `OfferPayloadUtils` signature/root approval helpers |
| Lend/multi-limit order | loan-token approval to the core Midnight contract, `OfferUtils.buildOffer` with `buy: true`, grouped payload construction, `RatifierUtils`, `MidnightRouterApi`, `OfferPayloadUtils` signature/root approval helpers |

## Implementation Phases

Status as of the 2026-06-04 implementation review:

- **Phase 1 - Package skeleton: completed.** `packages/midnight-sdk` has package metadata, TypeScript configs, package-level `AGENTS.md`, public barrel exports, test project wiring, and a changeset.
- **Phase 2 - Contract surface: completed with address deployment deferred.** ABI literals, constants, types/classes, typed errors, and address-registry helpers are in package source. ABI literals pin `morpho-org/midnight` commit `a7c6da7e70cb216982f6c5d20b46f40b943e67e4`. Production address entries remain empty until reviewed deployment artifacts are available; custom registration covers local and fork deployments meanwhile.
- **Phase 3 - Math and offer utilities: completed.** `TickLib`, `TakeAmountsLib`, `ConsumableUnitsLib`, `MarketUtils`, `Offer`, `Take`, and `OfferUtils` landed with colocated unit tests and property-based tests for tick/price, unit conversion, offer-group creation, and protocol-only offer-group validation behavior.
- **Phase 4 - Bundle encoders: completed; direct encoders rejected.** `MidnightBundles` remains the only standalone calldata namespace. `MidnightCalls` and one-wrapper-per-core-entrypoint encoders should be removed from the public surface.
- **Phase 5 - Fetch and requirements: needs aggregate-fetch revision.** Fetch helpers use named `viem/actions` imports and mock-transport tests, but the public fetch surface should be collapsed into aggregate class fetchers (`fetchMarket`, `fetchPosition`, `fetchOfferStatus`) and grouped requirement-input fetchers. Requirement planners remain pure once current allowance, authorization, ratifier, root, signature, and validation inputs are supplied.
- **Phase 6 - Signatures, validation, and payloads: completed.** `RatifierUtils`, `OfferPayloadUtils`, `Payload`, and `MidnightRouterApi` landed. Router validation/rules are a lightweight `fetch` boundary rather than a runtime router dependency, and offer publication remains onchain through the existing Midnight mempool call descriptor. Maker-side payload utilities include Ecrecover/Setter ratifier-data decoding, local proof verification, Setter root approval descriptors, and Ecrecover root cancellation descriptors.
- **Phase 7 - App adoption: deferred.** Updating the markets-v2 app in `morpho-org/morpho-apps` remains a separate repository change and is not required to land this SDK repo PR.

## Considered Alternatives

### Alternative 1: Integrate Midnight into `morpho-sdk` now

Add `morpho-sdk` actions, entities, client namespaces, and package exports immediately.

**Why rejected:** the high-level action/entity shape is not settled enough. The app still needs lower-level utilities first, and those utilities are useful even if a future `morpho-sdk` integration chooses a different action vocabulary.

### Alternative 2: Keep all utilities in the markets-v2 app

Continue implementing Midnight order helpers directly in `morpho-apps`.

**Why rejected:** this duplicates protocol logic, makes app errors the only public contract, and increases the chance of drift in tick rounding, bundle route selection, ratifier handling, and authorization requirements.

### Alternative 3: Put Midnight utilities in `blue-sdk`

Extend `@morpho-org/blue-sdk` with Midnight addresses, constants, structs, and math.

**Why rejected:** Midnight is a separate protocol surface with its own lifecycle. Adding it to `blue-sdk` would turn Blue's package into a cross-protocol registry and violate the one-reason-to-exist package rule.

### Alternative 4: Create `midnight-sdk-viem` immediately

Mirror the Blue split from day one with both `@morpho-org/midnight-sdk` and `@morpho-org/midnight-sdk-viem`.

**Why rejected:** a second package may become right later, but it is premature before the utility surface stabilizes. This TIB keeps I/O in explicit boundary modules and allows a later extraction if the viem surface grows.

### Alternative 5: Wrap the app `ActionFlow` API

Expose app-style labels, call requests, signature requests, and success callbacks from `midnight-sdk`.

**Why rejected:** that would couple a protocol package to app UI orchestration. `midnight-sdk` should return neutral call, signature, validation, and requirement descriptors.

## Assumptions & Constraints

- Midnight production addresses are pinned only after a reviewed deployment artifact is available. Additional chains are additive address-registry updates unless the ABI changes.
- The package pins the ABI revision used by the app and contracts. If `morpho-org/midnight` `main` differs from the deployed artifact, implementation pins the deployed artifact and documents the source.
- App quote/order sources continue to provide executable offers or takeable offers. `midnight-sdk` does not fetch an orderbook.
- Router/API payload validation and rule inspection are wrapped by `MidnightRouterApi`. If a future PR adds `@morpho-dev/router`, it must justify the dependency and keep it wrapped behind `midnight-sdk` APIs.
- Aggregate fetch helpers use transport-bound unit tests via `createMockClient` from `@morpho-org/test/mock`. Fork tests are required when a fetched class field's correctness depends on live contract behavior rather than request/response shape.
- All exported symbols require JSDoc and explicit `src/index.ts` re-exports.

## Dependencies

- `viem` as a peer dependency for ABI encoding, typed data, bytecode reads, and explicit aggregate fetch-boundary helpers.
- `@morpho-org/morpho-ts` as a workspace peer dependency for shared SDK primitives, `MathLib`, shared constants, typed errors, assertions, and `deepFreeze`.
- `@morpho-org/test` as a dev dependency for mock-transport tests.
- `fast-check` as a dev dependency for property-based tests.
- No runtime `@morpho-dev/router` dependency in the initial implementation; payload validation/rules use the router HTTP API through global or injected `fetch`.

## Security

- User bounds are first-class. Bundle builders must preserve `maxBuyerAssets`, `minSellerAssets`, `minUnits`, `maxUnits`, referral fee handling, and empty-withdrawal/empty-collateral semantics exactly.
- Bundler skip semantics are documented and tested. Individual failed `take` calls may be skipped by `MidnightBundles`, but aggregate fills must still satisfy the user's bound.
- Authorization is explicit. `setIsAuthorized` calls are returned only as requirement descriptors; no helper silently grants authorization.
- Permit helpers must distinguish `PermitKind.None`, `PermitKind.ERC2612`, and `PermitKind.Permit2`; tests cover encoded `TokenPermit` shapes.
- Signature helpers must never own wallet state. They accept injected signing callbacks or return typed data descriptors.
- Validation helpers must surface typed errors. No SDK source should throw plain `Error`.
- Tick/price and units/assets helpers must be byte-for-byte compatible with the deployed Solidity math where they claim parity.

## Future Considerations

- A future `@morpho-org/midnight-sdk-viem` package if aggregate fetch helpers grow beyond a small boundary surface.
- A future high-level `@morpho-org/morpho-sdk/midnight` entrypoint once action/entity names and requirement semantics stabilize.
- A typed quoter/orderbook SDK for fetching executable offers.
- Multi-chain Midnight address entries.
- Liquidation, flash-loan, fee/admin, and callback utilities.

## Open Questions

- What exact reviewed deployed addresses should populate the first production registry entry for `Midnight`, `MidnightBundles`, `MidnightMempool`, `EcrecoverRatifier`, and `SetterRatifier`?
- Once production addresses are pinned, which aggregate fetchers or fetched class fields need fork tests because their correctness depends on live contract behavior rather than request/response shape?
- After app adoption, is the root-export viem boundary still small enough, or should it move to a `./viem` subpath or future `@morpho-org/midnight-sdk-viem` package?

## References

- Midnight Solidity repository: <https://github.com/morpho-org/midnight>
- `IMidnight.sol`: <https://github.com/morpho-org/midnight/blob/main/src/interfaces/IMidnight.sol>
- `IMidnightBundles.sol`: <https://github.com/morpho-org/midnight/blob/main/src/periphery/interfaces/IMidnightBundles.sol>
- `MidnightBundles.sol`: <https://github.com/morpho-org/midnight/blob/main/src/periphery/MidnightBundles.sol>
- `TickLib.sol`: <https://github.com/morpho-org/midnight/blob/main/src/libraries/TickLib.sol>
- `TakeAmountsLib.sol`: <https://github.com/morpho-org/midnight/blob/main/src/periphery/TakeAmountsLib.sol>
- `ConsumableUnitsLib.sol`: <https://github.com/morpho-org/midnight/blob/main/src/periphery/ConsumableUnitsLib.sol>
- Markets-v2 app order actions: <https://github.com/morpho-org/morpho-apps/tree/main/apps/markets-v2-app/lib/modules/order/actions>
- Router API mempool validation docs: <https://router.morpho.dev/docs/api#tag/mempool/POST/v1/midnight/mempool/validate>
- AGENTS.md section 1 (layering), section 2 (forbidden patterns), section 3 (type discipline), section 5 (testing), section 6 (JSDoc)
- [TIB-2026-04-27](./TIB-2026-04-27-maximize-unit-test-coverage.md) (mock-transport unit-test boundary)
- [TIB-2026-05-04](./TIB-2026-05-04-jsdoc-coverage-on-exported-symbols.md) (JSDoc coverage on exported symbols)

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
  of how the decision was reached. TIBs feed the conventions doc - they do not
  override it.
-->
