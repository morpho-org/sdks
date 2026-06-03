# TIB-2026-05-20: Create a Midnight SDK utility package

| Field      | Value                                      |
| ---------- | ------------------------------------------ |
| **Status** | Proposed                                   |
| **Date**   | 2026-05-20                                 |
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
- Provide utilities that directly support the current markets-v2 app action flows without importing app code: market struct conversion, offer/take conversion, tick/price math, units/assets rounding helpers grouped under utility namespaces, `MidnightBundles` namespaced calldata encoders, direct core call encoders, requirement planning, fetch helpers, and make-offer signature/validation helpers.
- Keep the package framework-free: no React, wagmi, Redux, app router state, UI action-flow types, or app-specific error classes.
- Keep I/O isolated in explicit boundary modules such as `fetch/`, `requirements/`, and `signatures/`. Pure protocol helpers remain testable without mocks.
- Pin the deployed Midnight contract surface in package source: `Midnight`, `MidnightBundles`, `MidnightMempool`, `EcrecoverRatifier`, `SetterRatifier`, and Permit2 where needed by bundler permit helpers.
- Export typed errors for integrators to pattern-match on instead of throwing plain `Error`.
- Cover the package with colocated unit tests, property-based tests for tick/price and unit/asset conversion, and viem mock-transport tests for fetch and requirement readers.

**Non-Goals**

- No `@morpho-org/morpho-sdk` source, package export, action, entity, or dependency changes in this TIB.
- No Blue-style `client.midnight.market(...)` instance in this TIB.
- No `@morpho-org/blue-sdk` or `@morpho-org/blue-sdk-viem` changes.
- No React, wagmi, app `ActionFlow`, toast, label, analytics, or UI-state abstractions in `midnight-sdk`.
- No quoter or orderbook client in this package. The package can define quote/take input shapes and build on-chain `Take[]`, but executable offers still come from the app or a future orderbook SDK.
- No protocol/admin operations beyond utility support for user-facing order, requirement, fetch, and signature flows.
- No runtime ABI fetch. ABI literals and addresses are pinned in source.
- No deprecated package updates.

## Current Solution

Today Midnight utilities are spread across the Solidity repository and the markets-v2 app:

- `morpho-org/midnight` owns the canonical Solidity structs, constants, tick math, periphery routing, and ratifier contracts.
- `morpho-org/morpho-apps` re-implements address lookup, app market-to-Solidity struct conversion, take construction, allowance and authorization reads, approval and authorization call building, units/assets rounding, ratifier selection, router payload validation, signatures, root approval, and mempool submission.

That works for one app, but it is not an SDK-versioned contract. It also encourages plain app errors, duplicated rounding rules, repeated authorization logic, and future drift between app code and the deployed contracts.

## Proposed Solution

Create `packages/midnight-sdk` as a focused Midnight protocol utility package. The package should be small, side-effect-free at top level, and explicit about the boundary between pure helpers and I/O helpers.

Proposed source shape:

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
    +-- calls/
    |   +-- MidnightCalls.ts
    |   +-- index.ts
    +-- fetch/
    |   +-- midnight.ts
    |   +-- requirements.ts
    |   +-- index.ts
    +-- requirements/
    |   +-- approval.ts
    |   +-- authorization.ts
    |   +-- orderPlans.ts
    |   +-- index.ts
    +-- signatures/
        +-- OfferPayloadUtils.ts
        +-- OfferValidationUtils.ts
        +-- RatifierUtils.ts
        +-- index.ts
```

The root barrel exports the stable package surface explicitly, including `MarketUtils`,
`OfferUtils`, `TickLib`, `TakeAmountsLib`, `ConsumableUnitsLib`, `MidnightBundles`,
`MidnightCalls`, and their supporting parameter types. If reviewers want a stronger viem boundary,
the fetch and encoding modules may also be exported from a `./viem` subpath, but this TIB does not
create a second package.

### Contract Data

`addresses.ts` owns immutable registry entries:

- `midnight`
- `midnightBundles`
- `midnightMempool`
- `ecrecoverRatifier`
- `setterRatifier`
- `permit2`

The public helper should be named around the protocol rather than the app codename:

```ts
const addresses = getMidnightAddresses(chainId);
```

`abis.ts` owns pinned ABI literals:

- `midnightAbi`
- `midnightBundlesAbi`
- `midnightMempoolAbi` if mempool submission needs an ABI-backed call surface; otherwise mempool submission can remain a raw `to` + payload call
- `ecrecoverRatifierAbi`
- `setterRatifierAbi`

The package should pin the implementation revision and deployed ABI source in comments or documentation. Runtime ABI fetches are out of scope.

### Types, Classes, and Constants

`midnight-sdk` should model the Solidity structs as readonly TypeScript types/classes:

- `Market`
- `CollateralParams`
- `Offer`
- `Take`
- `TokenPermit`
- `CollateralSupply`
- `CollateralWithdrawal`
- `MarketState`
- `Position`
- `RatifierInfo`
- `MidnightAddresses`
- quote-facing raw input shapes for converting app/router responses into `Offer` and `Take`

Constants should include the protocol constants that app actions currently need or will need to validate inputs:

- `WAD`
- `ORACLE_PRICE_SCALE`
- `CBP`
- `MAX_TICK`
- `PRICE_ROUNDING_STEP`
- `DEFAULT_TICK_SPACING`
- `MAX_COLLATERALS`
- `MAX_COLLATERALS_PER_BORROWER`
- allowed LLTV tiers
- max settlement fee constants
- `PERMIT2_ADDRESS`
- `PermitKind`

Classes should normalize nested values, validate protocol shape, and expose conversion helpers such as `toStruct()` or `toAbiArgs()`. They must not fetch or sign. Plain interfaces may still be exported for call sites that already have normalized data.

### Utility Libraries and Namespaces

Pure helpers should follow the same naming shape as `blue-sdk`: Solidity libraries get TypeScript
`*Lib` namespaces with exact method names where the helper mirrors onchain behavior, and SDK-only
derived helpers live in domain `*Utils` namespaces. Narrow SDK conveniences may live in an
onchain-named library only when they are clearly part of that library's domain and are documented as
SDK additions. Do not create a broad `Midnight` namespace that mixes market math, offers,
signatures, and calldata.

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
- normalize addresses and hex values;
- convert numeric string fields to `bigint`;
- produce the on-chain `Take` shape: `{ units, offer, ratifierData }`;
- reject an empty input with a typed `NoMatchingOffersError`;
- validate offer side where the caller expects one side (`buy` offers for borrower market-orders, `sell` offers for lender market-orders);
- validate a consistent market when callers choose to enforce it before encoding a bundle.

Make-offer helpers should support the limit-order path without importing app code:

- `OfferUtils.buildOffer` builds `Offer` values from market, side, tick, max assets, expiry, group, callback, receiver, and ratifier inputs;
- generate or accept a group id;
- expose router payload/root helpers behind stable SDK functions;
- keep any dependency on `@morpho-dev/router` contained behind `signatures/` and `offers/` wrappers, with a package-level dependency justification in the PR.

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

### MidnightCalls Namespace

The package should expose direct core contract encoders under a narrow `MidnightCalls` namespace.
This namespace only encodes user-facing calls to the core `Midnight` contract; it is not a
catch-all protocol namespace. Method names should match the Solidity entrypoints exactly.

```ts
export namespace MidnightCalls {
  export function supplyCollateral(params: SupplyCollateralCallParams): MidnightCall;
  export function withdrawCollateral(params: WithdrawCollateralCallParams): MidnightCall;
  export function repay(params: RepayCallParams): MidnightCall;
  export function setIsAuthorized(params: SetIsAuthorizedCallParams): MidnightCall;
}
```

These are calldata utilities, not high-level SDK actions. They do not decide labels, button text, analytics, or app flow state.

### Fetch Methods

Fetch helpers live in `src/fetch/` and are the only modules that read chain state. They accept a viem `Client` or a minimal reader interface and use named `viem/actions` imports, so tests can use `createMockClient` from `@morpho-org/test/mock`.

Initial fetch helpers:

- `fetchIsAuthorized`
- `fetchErc20Allowance`
- `fetchMarketId`
- `fetchMarketState`
- `fetchPosition`
- `fetchCollateral`
- `fetchCredit`
- `fetchDebt`
- `fetchWithdrawable`
- `fetchIsHealthy`
- `fetchTickSpacing`
- `fetchSettlementFee`
- `fetchConsumed`
- `fetchConsumableUnits`
- `fetchRatifierInfo`, which reads bytecode and delegates classification to `RatifierUtils.getRatifierInfo`; it must preserve the EIP-7702 designator rule from the app: no code, `0x`, or `0xef0100...` routes through Ecrecover; other code routes through Setter.

Fetch helpers must not mutate state, sign, submit transactions, or import UI/app code.

### Requirement Plans

The package should provide requirement planning utilities that return neutral descriptors. Apps can render those descriptors into their own `ActionFlow`, while future SDKs can map them to their own transaction requirement types.

Suggested requirement types:

```ts
type MidnightRequirement =
  | MidnightApprovalRequirement
  | MidnightAuthorizationRequirement
  | MidnightSignatureRequirement
  | MidnightRootApprovalRequirement
  | MidnightPayloadValidationRequirement;
```

Suggested planners:

- `planApprovalRequirement` from required amount and current allowance;
- `planAuthorizationRequirement` from authorizer, authorized contract, and current `isAuthorized`;
- `planBorrowMarketOrderRequirements` for collateral approval to `MidnightBundles` and bundler authorization;
- `planLendMarketOrderRequirements` for loan-token approval to `MidnightBundles` and bundler authorization;
- `planSupplyCollateralRequirements` for collateral approval to the core Midnight contract;
- `planMakeOfferRequirements` for ratifier authorization, Ecrecover signature, Setter root approval, and payload validation.

Requirement planners should be pure once their current state inputs are supplied. Companion `fetch...RequirementInputs` helpers may gather current allowance, authorization, settlement fee, consumed amounts, and ratifier info.

### Signatures and Validation

Make-offer flows need reusable utilities, but the SDK should not own a wallet or a UI wizard. It should expose grouped helpers:

- `RatifierUtils.getRatifierInfo`
- `OfferPayloadUtils.buildOfferPayload`
- `OfferPayloadUtils.buildOfferTreeRoot`
- `OfferPayloadUtils.buildEcrecoverRatificationTypedData` or `OfferPayloadUtils.signEcrecoverRatification` with an injected `signTypedData` callback;
- `OfferPayloadUtils.buildSetterRootApprovalCall`
- `OfferPayloadUtils.buildMempoolSubmissionCall`
- `OfferValidationUtils.validateOfferPayload` with an injected router API/client or a clearly documented optional dependency.

The app remains responsible for sequencing prompts. The SDK returns typed descriptors for "sign this typed data", "call this contract", and "submit this payload".

### App Action Mapping

The package should make these current app flows straightforward without becoming app-specific:

| Current app flow | Midnight SDK support |
| --- | --- |
| Borrow market order with collateral | `TickLib.rateToPrice`/tick helpers, `TakeAmountsLib` max-units rounding, `OfferUtils.buildTakesFromOffers`, `planBorrowMarketOrderRequirements`, `MidnightBundles.supplyCollateralAndSellWithAssetsTarget` |
| Borrow against existing collateral | Same bundle call with empty `CollateralSupply[]`; skip collateral allowance planning when collateral amount is zero |
| Supply collateral only | `planSupplyCollateralRequirements`, `MidnightCalls.supplyCollateral` |
| Lend market order | `TakeAmountsLib` min-units rounding, `planLendMarketOrderRequirements`, `MidnightBundles.buyWithAssetsTargetAndWithdrawCollateral` with empty withdrawals |
| Borrow limit order | `MidnightCalls.supplyCollateral`, `OfferUtils.buildOffer` with `buy: false`, `RatifierUtils`, `OfferValidationUtils`, `OfferPayloadUtils` signature/root approval helpers |
| Lend/multi-limit order | loan-token approval to the core Midnight contract, `OfferUtils.buildOffer` with `buy: true`, grouped payload construction, `RatifierUtils`, `OfferValidationUtils`, `OfferPayloadUtils` signature/root approval helpers |

## Implementation Phases

- **Phase 1 - Package skeleton:** Add `packages/midnight-sdk`, package metadata, TypeScript configs, package-level `AGENTS.md`, public barrel, test project wiring, and a changeset for the new published package.
- **Phase 2 - Contract surface:** Add addresses, ABIs, constants, types/classes, and typed errors. Pin the deployed ABI/address source and add unit tests for registry behavior and struct normalization.
- **Phase 3 - Math and offer utilities:** Port `TickLib`, `TakeAmountsLib`, `ConsumableUnitsLib`, `MarketUtils`, and `OfferUtils`. Add property-based tests and app-shape fixture tests.
- **Phase 4 - Bundle/direct encoders:** Add the `MidnightBundles` and `MidnightCalls` namespaces. Add inline snapshots for calldata and ABI args for each supported route.
- **Phase 5 - Fetch and requirements:** Add viem-backed fetch helpers, pure requirement planners, and mock-transport tests for allowance, authorization, settlement fee, consumed units, and ratifier detection.
- **Phase 6 - Signatures and validation:** Add `RatifierUtils`, `OfferPayloadUtils`, `OfferValidationUtils`, router validation wiring, and tests for Ecrecover and Setter flows.
- **Phase 7 - App adoption:** Update the markets-v2 app in its own repository to replace local duplicated utilities with `@morpho-org/midnight-sdk`. This TIB does not require that app migration to land in the SDK repo PR.

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

- Midnight remains Base-only for the first package release. Additional chains are additive address-registry updates unless the ABI changes.
- The package pins the deployed ABI revision used by the app and contracts. If `morpho-org/midnight` `main` differs from the deployed artifact, implementation pins the deployed artifact and documents the source.
- App quote/order sources continue to provide executable offers or takeable offers. `midnight-sdk` does not fetch an orderbook.
- `@morpho-dev/router` may be needed for payload/tree/Ecrecover helpers. If added, the PR must justify it as the source of truth for off-chain Midnight order encoding and keep it wrapped behind `midnight-sdk` APIs.
- Fetch helpers use transport-bound unit tests via `createMockClient` from `@morpho-org/test/mock`. Fork tests are required when a helper's correctness depends on live contract behavior rather than request/response shape.
- All exported symbols require JSDoc and explicit `src/index.ts` re-exports.

## Dependencies

- `viem` for ABI encoding and optional fetch helpers. Keep it as a peer or dev/runtime dependency according to the final package export shape decided during implementation.
- `@morpho-org/morpho-ts` for shared SDK primitives if the package needs `BigIntish` or similar stable value types.
- `@morpho-org/test` for mock-transport and fork tests.
- `fast-check` for property-based tests.
- `@morpho-dev/router` only if required for payload/tree/Ecrecover semantics; otherwise keep router fixtures in tests and implement the minimal stable helpers locally.

## Security

- User bounds are first-class. Bundle builders must preserve `maxBuyerAssets`, `minSellerAssets`, `minUnits`, `maxUnits`, referral fee handling, and empty-withdrawal/empty-collateral semantics exactly.
- Bundler skip semantics are documented and tested. Individual failed `take` calls may be skipped by `MidnightBundles`, but aggregate fills must still satisfy the user's bound.
- Authorization is explicit. `setIsAuthorized` calls are returned only as requirement descriptors; no helper silently grants authorization.
- Permit helpers must distinguish `PermitKind.None`, `PermitKind.ERC2612`, and `PermitKind.Permit2`; tests cover encoded `TokenPermit` shapes.
- Signature helpers must never own wallet state. They accept injected signing callbacks or return typed data descriptors.
- Validation helpers must surface typed errors. No SDK source should throw plain `Error`.
- Tick/price and units/assets helpers must be byte-for-byte compatible with the deployed Solidity math where they claim parity.

## Future Considerations

- A future `@morpho-org/midnight-sdk-viem` package if fetch/read helpers grow beyond a small boundary surface.
- A future high-level `@morpho-org/morpho-sdk/midnight` entrypoint once action/entity names and requirement semantics stabilize.
- A typed quoter/orderbook SDK for fetching executable offers.
- Multi-chain Midnight address entries.
- Liquidation, flash-loan, fee/admin, and callback utilities.

## Open Questions

- What exact deployed addresses and ABI artifact revision should the first package pin for `Midnight`, `MidnightBundles`, `MidnightMempool`, `EcrecoverRatifier`, and `SetterRatifier`?
- Should `viem` helpers live in the root export, a `./viem` subpath, or a follow-up `@morpho-org/midnight-sdk-viem` package?
- Should `@morpho-dev/router` be a runtime dependency, a peer dependency, or only a fixture source for tests?
- Which router validation API should `validateOfferPayload` target, and how should the package expose network failures vs protocol validation failures?

## References

- Midnight Solidity repository: <https://github.com/morpho-org/midnight>
- `IMidnight.sol`: <https://github.com/morpho-org/midnight/blob/main/src/interfaces/IMidnight.sol>
- `IMidnightBundles.sol`: <https://github.com/morpho-org/midnight/blob/main/src/periphery/interfaces/IMidnightBundles.sol>
- `MidnightBundles.sol`: <https://github.com/morpho-org/midnight/blob/main/src/periphery/MidnightBundles.sol>
- `TickLib.sol`: <https://github.com/morpho-org/midnight/blob/main/src/libraries/TickLib.sol>
- `TakeAmountsLib.sol`: <https://github.com/morpho-org/midnight/blob/main/src/periphery/TakeAmountsLib.sol>
- `ConsumableUnitsLib.sol`: <https://github.com/morpho-org/midnight/blob/main/src/periphery/ConsumableUnitsLib.sol>
- Markets-v2 app order actions: <https://github.com/morpho-org/morpho-apps/tree/main/apps/markets-v2-app/lib/modules/order/actions>
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
