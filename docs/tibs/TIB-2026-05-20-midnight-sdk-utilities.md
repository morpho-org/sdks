# TIB-2026-05-20: Create a Midnight SDK utility package

| Field      | Value                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------ |
| **Status** | Accepted                                                                                   |
| **Date**   | 2026-05-20 (updated 2026-06-08)                                                            |
| **Author** | @0xbulma                                                                                   |
| **Scope**  | Packages: `@morpho-org/midnight-sdk`, `@morpho-org/morpho-ts`, `@morpho-org/blue-sdk` shim |

---

## Context

Midnight is Morpho's fixed-rate, order-driven lending protocol, formerly discussed as MarketV2. It is not a second version of Blue's pooled variable-rate market. It has its own market struct, offer schema, tick/price math, ratifier model, mempool payloads, and periphery contract.

The current app implementation in `morpho-org/morpho-apps` builds Midnight order flows directly in `apps/markets-v2-app/lib/modules/order/actions`. Those flows already encode useful reusable knowledge:

- market-order borrowing routes through the periphery `supplyCollateralAndSellWithAssetsTarget` entrypoint, computes a max-units bound from the user's max rate, reads ERC-20 allowance and `Midnight.isAuthorized`, and optionally emits approval and authorization calls;
- market-order lending routes through the periphery `buyWithAssetsTargetAndWithdrawCollateral` entrypoint with an empty `CollateralWithdrawal[]`, computes a min-units bound from the user's min rate, and relies on the bundler's per-take skip semantics;
- supply-only collateral calls `Midnight.supplyCollateral` directly because the periphery bundler indexes `takes[0]` and cannot handle an empty take list;
- limit-order flows use public API payload validation, Ecrecover-vs-Setter ratifier selection, `setIsAuthorized`, offer-root signing or root approval, and mempool submission.

Keeping those details only in app code makes every downstream integration re-learn the same protocol edges. A high-level `@morpho-org/morpho-sdk` Midnight client is still too premature: the action/entity shape, Blue-parity naming, and release contract need more product and protocol mileage. This TIB creates a dedicated `@morpho-org/midnight-sdk` package for Midnight protocol utilities while extracting shared Blue/Midnight address and deployment registries to `@morpho-org/morpho-ts`.

## Goals / Non-Goals

**Goals**

- Add `@morpho-org/midnight-sdk` as the source of truth for Midnight-specific constants, protocol value types/interfaces, typed errors, deterministic helper functions, fetch/API helpers, and signature/payload utilities.
- Keep Midnight-specific ABI literals in `@morpho-org/midnight-sdk`, where the protocol helpers that consume them live.
- Extract generic SDK primitives that Midnight and Blue share into `@morpho-org/morpho-ts`, including fixed-point math, bigint input helpers, shared hex/address/call descriptor types, shared typed errors, shared constants, and validation helpers; continue using existing generic `morpho-ts` helpers such as `deepFreeze` directly.
- Keep `@morpho-org/midnight-sdk` free of compatibility re-exports for anything available from `@morpho-org/morpho-ts`. Midnight source and tests consume those shared symbols directly from `morpho-ts`. If Midnight needs a reusable non-protocol symbol that is not already exported there, add it to `morpho-ts` first and import it from there.
- Preserve existing Blue import paths for extracted symbols by re-exporting each one from the same `@morpho-org/blue-sdk` module where it was previously defined.
- Move non-Blue-specific ABI literals currently exposed from `@morpho-org/blue-sdk-viem` into `@morpho-org/morpho-ts`, and re-export them from `@morpho-org/blue-sdk-viem` so existing imports keep working. Blue-specific ABI literals stay in `@morpho-org/blue-sdk-viem`, and Blue ABI-parameter descriptors such as `marketParamsAbi` stay in `@morpho-org/blue-sdk`.
- Provide utilities that directly support the current markets-v2 app action flows without importing app code: market struct conversion, offer/takeable-offer conversion, tick/price math, units/assets rounding helpers grouped under utility namespaces, fetch helpers, and make-offer signature/validation helpers. Core and periphery ABI literals stay pinned and exported from `@morpho-org/midnight-sdk` so integrators can encode standalone calls themselves; standalone one-function calldata wrapper namespaces are out of scope. Higher-level helpers may return call descriptors only when they own workflow context beyond raw ABI encoding.
- Keep the package framework-free: no React, wagmi, Redux, app router state, UI action-flow types, or app-specific error classes.
- Keep I/O isolated in explicit boundary modules such as `fetch/` and `api/`, while pure protocol helpers remain testable without mocks.
- Pin the Midnight ABI surface in `@morpho-org/midnight-sdk` and expose Midnight address/deployment accessors from `@morpho-org/morpho-ts` for the core Midnight contract, periphery bundler, Midnight mempool, Ecrecover ratifier, Setter ratifier, and Permit2 address. Production addresses are added only when reviewed deployment artifacts are available.
- Export typed errors for integrators to pattern-match on instead of throwing plain `Error`.
- Cover the package with colocated unit tests, property-based tests for tick/price and unit/asset conversion, and viem mock-transport tests for fetch/API boundary helpers.

**Non-Goals**

- No `@morpho-org/morpho-sdk` Midnight action, entity, client namespace, workflow-helper, ABI, or address changes in this TIB.
- No Blue-style `client.midnight.market(...)` instance in this TIB.
- No Blue protocol-surface behavior changes. Blue edits are limited to shared primitive compatibility, such as re-exporting extracted math, constants, errors, and address registries from their old `blue-sdk` paths.
- No Blue-specific ABI ownership changes. `blueAbi`, `adaptiveCurveIrmAbi`, `blueOracleAbi`, `preLiquidationFactoryAbi`, and `preLiquidationAbi` stay in `@morpho-org/blue-sdk-viem`; descriptors such as `marketParamsAbi` stay in `@morpho-org/blue-sdk`.
- No `midnight-sdk` compatibility facade for generic `morpho-ts` utilities. `midnight-sdk` is not published yet, so its own source, docs, and downstream app rewires should import shared primitives directly from `@morpho-org/morpho-ts` instead of preserving temporary `midnight-sdk` re-export paths. This includes symbols that already exist in `morpho-ts`, plus future shared non-protocol symbols that should be added to `morpho-ts` before Midnight consumes them.
- No React, wagmi, app `ActionFlow`, toast, label, analytics, or UI-state abstractions in `midnight-sdk`.
- No generated router client or runtime router dependency in this package. The package owns lightweight `MidnightApi` wrappers for the current book, quote, takeable-offer, validation, and rules endpoints, while protocol conversion helpers remain independent from any app code.
- No protocol/admin operations beyond utility support for user-facing order, fetch, and signature flows.
- No runtime ABI fetch. ABI literals and address-registry fields are pinned in source; production address values are added only from reviewed deployment artifacts.
- No deprecated package updates.

## Current Solution

Today Midnight utilities are spread across the Solidity repository and the markets-v2 app:

- `morpho-org/midnight` owns the canonical Solidity structs, constants, tick math, periphery routing, and ratifier contracts.
- `morpho-org/morpho-apps` re-implements address lookup, app market-to-Solidity struct conversion, take construction, allowance and authorization reads, approval and authorization call building, units/assets rounding, ratifier selection, API payload validation, signatures, root approval, and mempool submission.
- `@morpho-org/blue-sdk` and `@morpho-org/blue-sdk-viem` historically owned generic SDK primitives and contract data that are useful outside Blue, such as `MathLib`, `RoundingDirection`, `ORACLE_PRICE_SCALE`, `UnsupportedChainIdError`, address-registry mechanics, shared deployment metadata such as Permit2, and ABI literals for shared Morpho/infrastructure contracts.

That works for one app, but it is not an SDK-versioned contract. It also encourages plain app errors, duplicated rounding rules, repeated authorization logic, and future drift between app code and the deployed contracts.
Importing those generic primitives from `@morpho-org/blue-sdk` would couple Midnight to the Blue package for non-Blue concepts, while re-exporting them from `@morpho-org/midnight-sdk` would create a second compatibility surface before Midnight has shipped.

## Proposed Solution

Create `packages/midnight-sdk` as a focused Midnight protocol utility package. The package should be small, side-effect-free at top level, and explicit about the boundary between pure helpers and I/O helpers.

Accepted source shape:

```text
packages/midnight-sdk/
+-- AGENTS.md
+-- README.md
+-- contracts/
|   +-- GetPosition.sol
|   +-- interfaces/
|       +-- IMidnight.sol
+-- package.json
+-- tsconfig*.json
+-- src/
    +-- abis.ts
    +-- constants.ts
    +-- errors.ts
    +-- index.ts
    +-- market/
    |   +-- Market.ts
    |   +-- MarketUtils.ts
    |   +-- Position.ts
    |   +-- index.ts
    +-- offers/
    |   +-- Offer.ts
    |   +-- TakeableOffer.ts
    |   +-- OfferUtils.ts
    |   +-- TakeableOfferUtils.ts
    |   +-- index.ts
    +-- math/
    |   +-- ConsumableUnitsLib.ts
    |   +-- TakeAmountsLib.ts
    |   +-- TickLib.ts
    |   +-- index.ts
    +-- fetch/
    |   +-- midnight.ts
    |   +-- index.ts
    +-- queries/
    |   +-- GetPosition.ts
    |   +-- index.ts
    +-- api/
    |   +-- MidnightApi.ts
    |   +-- index.ts
    +-- signatures/
        +-- Tree.ts
        +-- TreeUtils.ts
        +-- OfferTreeUtils.ts
        +-- Payload.ts
        +-- RatifierUtils.ts
        +-- index.ts
```

The root barrel exports the stable package surface explicitly, including `MarketUtils`,
`OfferUtils`, `TakeableOfferUtils`, `OfferTreeUtils`, `TreeUtils`, `TickLib`,
`TakeAmountsLib`, `ConsumableUnitsLib`, `Payload`, `Offer`, `TakeableOffer`, `Group`, `Tree`,
`EcrecoverRatifier`, `SetterRatifier`, `MidnightApi`,
`MIDNIGHT_SDK_VERSION`, typed errors such as `InvalidOfferGroupError` and
`InvalidOfferTreeError`, fetch helpers such as `fetchMarketParams`, `fetchMarket`,
`fetchPosition`, `fetchAccrualPosition`, `fetchConsumableUnits`, and `fetchRatifierInfo`, and their
supporting parameter types. The initial implementation keeps viem-backed fetch/API helpers in the
root export; a separate `./viem` subpath or package can be introduced later if the I/O surface
grows.

`midnight-sdk` exports the Midnight ABI literals it uses internally. Shared address/deployment
registries and registration helpers live in `@morpho-org/morpho-ts`, not in `midnight-sdk`.

### Shared Morpho TS Extraction

Generic primitives shared by Blue and Midnight live in `@morpho-org/morpho-ts`, not in either
protocol package:

- `MathLib` and `RoundingDirection` live in `morpho-ts/src/math.ts`.
- `BigIntish`, `Address`, `Hex`, and `EncodedCall` live in `morpho-ts/src/types.ts`.
- `ORACLE_PRICE_SCALE` lives in `morpho-ts/src/constants.ts`.
- `UnsupportedChainIdError`, `InvalidBitLengthError`, `DivisionByZeroError`, and
  `NegativeValueError` live in `morpho-ts/src/errors.ts`.
- `assertNonNegative`, `deepFreeze`, and generic object/array helpers live in
  `morpho-ts/src/utils.ts`.
- Unified Blue/Midnight address and deployment registries live in `morpho-ts/src/addresses.ts`.
- Non-Blue-specific ABI literals live in `morpho-ts/src/abis.ts`.

`@morpho-org/blue-sdk` keeps compatibility for existing consumers by re-exporting extracted symbols
from the same module where they were previously defined:

- `packages/blue-sdk/src/math/MathLib.ts` re-exports `MathLib` and `RoundingDirection` from
  `@morpho-org/morpho-ts`.
- `packages/blue-sdk/src/constants.ts` continues to export `ORACLE_PRICE_SCALE`, backed by the
  shared `morpho-ts` value.
- `packages/blue-sdk/src/errors.ts` re-exports `UnsupportedChainIdError` from `morpho-ts`, and Blue
  internals such as `getChainAddresses` import that shared error directly.
- `packages/blue-sdk/src/addresses.ts` re-exports the shared address registry, deployment registry,
  `NATIVE_ADDRESS`, address-label types, lookup helpers, token mapping helpers, and
  `registerCustomAddresses` so existing imports from `@morpho-org/blue-sdk` keep working.

Blue ABI surfaces use the same split as shared primitives: non-Blue-specific ABI literals are
defined in `@morpho-org/morpho-ts` and re-exported from `@morpho-org/blue-sdk-viem` for backward
compatibility. This includes ERC/Permit2/wstETH, wrapper, MetaMorpho/Vault V1, Vault V2, factory,
public allocator, and Vault V2 adapter ABI literals. Blue-specific viem ABI literals stay in
`@morpho-org/blue-sdk-viem`: `blueAbi`, `adaptiveCurveIrmAbi`, `blueOracleAbi`,
`preLiquidationFactoryAbi`, and `preLiquidationAbi`. ABI-parameter descriptors tied to Blue domain
types, such as `marketParamsAbi`, stay in `@morpho-org/blue-sdk`.

`@morpho-org/midnight-sdk` does not provide old-path compatibility for shared primitives because it
has not been published. Midnight source, tests, examples, and app adoption work import shared
utilities/errors/helpers/constants/types directly from `@morpho-org/morpho-ts` when the symbol is
defined there. If a helper is not Midnight-protocol-specific and is needed by Midnight, it is first
exported from `morpho-ts` and then imported directly by Midnight. Midnight source imports address
helpers from `@morpho-org/morpho-ts`. The Midnight root export is reserved for protocol types, ABI
literals, typed errors, math libraries, fetch/API helpers, and signature/payload utilities.

### Contract Data

`@morpho-org/morpho-ts` owns the unified Morpho address and deployment registries.
`packages/blue-sdk/src/addresses.ts` re-exports the Blue-shaped view so existing imports from
`@morpho-org/blue-sdk` keep working. `MidnightAddresses` is the resolved Midnight address view
returned to callers. It contains the five Midnight-specific addresses plus the Permit2 address:

```ts
interface MidnightAddresses {
  readonly midnight: Address;
  readonly midnightBundles: Address;
  readonly midnightMempool: Address;
  readonly ecrecoverRatifier: Address;
  readonly setterRatifier: Address;
  readonly permit2: Address;
}
```

`MidnightDeployments` mirrors `MidnightAddresses` with deployment block numbers.
`getMidnightAddresses`, `getMidnightDeployments`, and `registerCustomMidnightAddresses` are exported
from `@morpho-org/morpho-ts`, not from `@morpho-org/midnight-sdk`:

```ts
import {
  getMidnightAddresses,
  getMidnightDeployments,
  registerCustomMidnightAddresses,
} from "@morpho-org/morpho-ts";

const midnightAddresses = getMidnightAddresses(chainId);
const midnightDeployments = getMidnightDeployments(chainId);

registerCustomMidnightAddresses({
  addresses: {
    31337: {
      midnight: "0x0000000000000000000000000000000000000001",
      midnightBundles: "0x0000000000000000000000000000000000000002",
      midnightMempool: "0x0000000000000000000000000000000000000003",
      ecrecoverRatifier: "0x0000000000000000000000000000000000000004",
      setterRatifier: "0x0000000000000000000000000000000000000005",
      permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    },
  },
  deployments: {
    31337: {
      midnight: 1n,
      midnightBundles: 2n,
      midnightMempool: 3n,
      ecrecoverRatifier: 4n,
      setterRatifier: 5n,
      permit2: 6n,
    },
  },
});
```

Known chains may provide partial Midnight entries, but existing values cannot be overwritten with a
different address or deployment block. Unknown chains must provide every Midnight-specific address
and `permit2` for address registration, and every matching deployment block for deployment
registration. The object-style `midnightAddresses` / `midnightAddressRegistry` and
`midnightDeployments` / `midnightDeploymentRegistry` exports remain available from
`@morpho-org/morpho-ts` for compatibility with the object-registry DX.

Production Midnight addresses are intentionally absent until a reviewed deployment artifact pins
them. Adding production addresses updates the `morpho-ts` Midnight registry by chain id; no runtime
address fetches are introduced.

`packages/midnight-sdk/src/abis.ts` exports the ABI literals consumed by Midnight utilities:

- `midnightAbi`
- `midnightBundlesAbi`
- `ecrecoverRatifierAbi`
- `setterRatifierAbi`

Mempool submission remains a raw `to` + payload call descriptor rather than an ABI-backed
`midnightMempoolAbi`. Each pinned ABI literal documents the `morpho-org/midnight` source commit and
artifact path. Runtime ABI fetches are out of scope. Integrators that only need a single contract
call can import these ABI literals from `@morpho-org/midnight-sdk` and use their viem encoder
directly instead of going through SDK wrapper functions.

Deployless fetcher bytecode is kept as generated `abi` and `code` constants under `src/queries/`,
matching the `blue-sdk-viem` pattern. The Solidity inputs live under `contracts/` and are compiled by
`pnpm --filter @morpho-org/midnight-sdk compile` through the shared `scripts/compile-solidity.js`
helper. The initial generated query is:

- `GetPosition`, which reads `position(id, user)` and all 128 fixed `collateral(id, user, index)` slots in one deployless call.

### Types, Classes, and Constants

`midnight-sdk` should model Solidity structs and fetchable state as readonly TypeScript
types by default, with classes reserved for typed errors and behavior-bearing domain or boundary objects.
Types stay colocated with the module that owns the relevant behavior; small one-concept interfaces do
not get dedicated files. When a domain interface and ABI struct shape are identical, the SDK exports
one interface and reuses it instead of publishing duplicate `Foo`/`FooStruct` names:

- `Market`
- `MarketParams`
- `CollateralParams`
- `Offer`
- `TakeableOffer`
- `Group`
- `Tree`
- `EcrecoverRatifier`
- `SetterRatifier`
- `MidnightApi`
- `TokenPermit`
- `CollateralSupply`
- `CollateralWithdrawal`
- `Position`
- `AccrualPosition`
- `RatifierInfo`
- quote-facing raw input shapes for converting app/API responses into `Offer` and `TakeableOffer`

`TakeableOffer` is the SDK/orderbook-facing alias for the Solidity periphery `Take` tuple
`{ units, offer, ratifierData }`; the SDK should avoid exporting a generic `Take` name for this
offchain executable-offer shape.

`midnight-sdk` exports Midnight-specific constants that app actions currently need or will need to
validate inputs:

- `CBP`
- `MAX_TICK`
- `PRICE_ROUNDING_STEP`
- `DEFAULT_TICK_SPACING`
- `MAX_COLLATERALS`
- `MAX_COLLATERALS_PER_BORROWER`
- allowed LLTV tiers
- max settlement fee constants
- max continuous fee and liquidation cursor constants
- HashLib typehash constants for markets, collateral params, offers, and the EIP-712 domain
- `PermitKind`

Generic constants, helpers, and typed errors such as
`MathLib.WAD`, `ORACLE_PRICE_SCALE`, `BigIntish`, `RoundingDirection`, `UnsupportedChainIdError`,
`DivisionByZeroError`, `InvalidBitLengthError`, `NegativeValueError`, `assertNonNegative`,
and `deepFreeze` live in `@morpho-org/morpho-ts`; `midnight-sdk` consumes them directly instead of
duplicating or re-exporting them as Midnight API. Midnight address-registry helpers live in
`@morpho-org/morpho-ts`; Midnight ABI literals live in `@morpho-org/midnight-sdk`. Permit2 is an
address-registry field rather than a standalone
`PERMIT2_ADDRESS` constant.

Midnight follows Blue SDK's market split. `MarketParams` / `IMarketParams` are the immutable
Solidity `Market` config fields: loan token, collateral params, maturity, RCF threshold, entry gate,
and liquidator gate. `Market` is the hydrated object `{ id, params, totalUnits, lossFactor,
withdrawable, continuousFeeCredit, settlementFeeCbps, continuousFee, tickSpacing }`. It exposes
domain behavior such as maturity/time-to-maturity checks, settlement-fee interpolation, collateral
lookup helpers, and id computation from params. `Position` is the raw user storage object: credit,
pending fee, last loss factor, last accrual, debt, collateral bitmap, and collateral balances.
`AccrualPosition extends Position` pairs a raw position with a `Market` and locally mirrors
Midnight's `updatePositionView` in a Blue-compatible `accrueInterest(timestamp)` method: slash by
the market loss factor, slash pending fee proportionally, accrue pending continuous fee until
`min(timestamp, market.params.maturity)`, sync `lastLossFactor`, and return a new
`AccrualPosition` with the market's continuous-fee credit increased by the accrued fee. The method
name follows the Blue SDK state-class convention, but the implementation must document that the
Midnight protocol operation is slashing plus continuous-fee accrual rather than pooled variable-rate
interest.

Low-value value wrappers should stay as interfaces/types rather than classes. Constructors and pure
class methods must not fetch, sign, or deep-freeze instances. User-facing factories that return class
instances should live as static methods on the class: `Offer.create`, `Offer.createGroup`,
`Group.create`, `Tree.create`, and similar APIs are preferred over public `*Utils` builders that
return class instances. Class-specific methods and getters should delegate to pure `*Utils` namespace
functions that accept readonly plain JavaScript objects compatible with the class public shape, so
object-first consumers can use the same logic without constructing classes. Classes must not expose
public `from(...)` or `toStruct()` methods whose only job is reshaping values for viem.
ABI-compatible plain objects are built by internal helpers in the modules that encode or call
contracts. Fetch helpers return populated domain objects where the class has meaningful behavior,
and primitive protocol values for narrower reads such as allowance, authorization, consumed amount,
settlement fee, root status, and ratifier classification.

There is no protocol-level `MAX_OFFERS_PER_TREE` constant. Public API capacity is a policy boundary
and can increase independently as traffic grows. The SDK therefore does not export a fixed
offer-count protocol constant; raw offer-tree construction is bounded only by available HashLib
offer-tree typehashes and payload encoding is bounded by compressed/decompressed byte-size guards.
Any API-publication helper should treat offer-count limits as fetched validation policy, not as a
Midnight protocol invariant.

### Utility Libraries and Namespaces

Pure helpers should follow the same naming shape as `blue-sdk`: Solidity libraries get TypeScript
`*Lib` namespaces with exact method names where the helper mirrors onchain behavior, and SDK-only
derived helpers live in domain `*Utils` namespaces. `*Utils` functions are the compatibility layer for
plain JavaScript objects and the implementation layer for class methods/getters; they should return
plain objects, primitives, validation results, or descriptors unless no public class owns the result.
Narrow SDK conveniences may live in an onchain-named library only when they are clearly part of that
library's domain and are documented as SDK additions. Do not create a broad `Midnight` namespace that
mixes market math, offers, and signatures.

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
- `MarketUtils.isLltvAllowed`
- `MarketUtils.getMaxLif`
- `OfferUtils.getOfferExpiry`

The pure helpers that mirror `TakeAmountsLib` should accept `settlementFee` as an explicit input instead of reading the chain. Fetching settlement fee remains a boundary concern; fetch helpers that compute it should accept `timeToMaturity` directly so callers do not confuse wall-clock time with Solidity's `block.timestamp`.

Rounding names should match local SDK convention: `"Up"` and `"Down"`. Tests must cover the app-known boundary cases:

- borrow market orders round max units up for the `supplyCollateralAndSellWithAssetsTarget` periphery route;
- lend market orders round min units down for the `buyWithAssetsTargetAndWithdrawCollateral` periphery route;
- `TickLib` prices are rounded to `PRICE_ROUNDING_STEP`;
- `TickLib.priceToTick` returns the lowest spacing-aligned tick with price greater than or equal to the input price.

### Offer and Takeable Offer Classes and Utilities

`TakeableOffer.createMany` should be the user-facing replacement for the app-local conversion in
`market-order.utils.ts`, while `TakeableOfferUtils` owns the pure object-compatible implementation.
It should:

- accept API/app quote entries that include `units`, `ratifierData`, and the inline offer;
- copy address and hex fields into ABI-compatible objects;
- convert numeric string fields to `bigint`;
- produce the takeable-offer shape: `{ units, offer, ratifierData }`;
- reject an empty input with a typed `NoMatchingOffersError`;
- validate offer side where the caller expects one side (`buy` offers for borrower market-orders, `sell` offers for lender market-orders);
- validate a consistent market when callers choose to enforce it before encoding a bundle.

Make-offer helpers should support the limit-order path without importing app code:

- `Offer.create` is the user-facing constructor for raw protocol `Offer` class instances from market, side, tick, max assets, expiry, callback, receiver, ratifier, and an explicit group input;
- `OfferUtils` owns pure object-compatible offer validation, struct conversion, offer expiry helpers, receiver-zeroing checks, cap checks, group hashing, and API-publication validation helpers;
- raw protocol helpers may accept explicit groups for contract parity, but maker-publication helpers should derive content-addressed group ids from the offers they publish so the result matches current Morpho API validation;
- `Offer.createGroup` / `Group.create` are the user-facing group factories. They build multiple offers with one derived group id, preserving caller order while using a deterministic content hash for the group identity; their implementation uses `OfferUtils` validation and hashing helpers that also accept plain offer-like objects;
- `OfferUtils.validateOfferGroup` exposes protocol checks and API-publication checks separately. Protocol checks enforce non-empty groups, same maker, same group, same side, same loan token, valid receiver zeroing, and exactly one non-zero unit/asset cap. API-publication checks additionally mirror the current public validation policy for maker trees, including content-addressed group identity, same callback address/data where required, non-overlapping active windows per market, and current capacity/rule constraints fetched from the API;
- `Tree.create({ groups })` builds a Merkle tree from `Group` instances or plain group inputs, preserving offer order across groups, and delegates tree hashing/proof logic to pure `TreeUtils` helpers that accept object-compatible group inputs;
- expose offer-tree, Merkle root, proof, ratifier-data, root-approval, mempool-submission, and API-validation helpers behind stable SDK classes and class methods where the return value is class-shaped;
- validate maker trees through `MidnightApi` before wallet signature/root approval; validation encodes empty per-leaf `ratifierData` because the API endpoint inspects offer contents, not ratifier data;
- keep offer publication/submission onchain through `Payload.buildSubmissionCall`; the current public API does not expose a submit endpoint.
- keep gatekeeper policy out of raw protocol helpers. API-publication helpers may mirror the public API rules as boundary validation, but should prefer surfaced API issues over hard-coded policy when rules are fetched or still changing.

### Call Descriptors

The package does not introduce standalone calldata namespaces for one-function contract calls. The
pinned ABI literals remain exported for integrators that need to encode those calls themselves. A
namespace that only maps each Solidity entrypoint to `{ to, data }` does not own route selection,
bound calculation, state reads, signing, or app sequencing.

SDK helpers may still return neutral call descriptors when the helper owns broader workflow context:

```ts
import type { EncodedCall } from "@morpho-org/morpho-ts";

const call = {} as EncodedCall;
console.log(call.to, call.data);
```

Examples include Setter root approval, Ecrecover root cancellation, and mempool-submission
descriptors. Future bundle helpers should be introduced only if they own
workflow-level behavior such as route selection, bound computation, or per-take skip semantics,
not as one-to-one wrappers for periphery entrypoints.

### Fetch Methods

Fetch helpers live in `src/fetch/` and are the only modules that read chain state. They accept a
viem `Client` or a minimal reader interface and use named `viem/actions` imports, so tests can use
`createMockClient` from `@morpho-org/test/mock`.

Fetch helpers accept `MidnightCallParameters` for `account`, `blockNumber`, `blockTag`, and
`stateOverride`. `fetchPosition` also accepts `DeploylessFetchParameters`, matching the Blue SDK
read mode for the high-fanout position query:

- `deployless: true` or omitted uses deployless reads and falls back to direct reads if deployless execution fails;
- `deployless: "force"` uses deployless reads without fallback and rethrows deployless read errors;
- `deployless: false` skips deployless reads and uses direct contract reads.

The current deployless scope is intentionally limited to `fetchPosition`, where the Solidity storage
getter omits the fixed collateral array and deployless bytecode collapses 129 reads into one call.
Single-contract single-getter reads stay as direct viem calls owned by the caller because SDK
fetch helpers are reserved for hydrated SDK objects, structured responses, or protocol computation.
`fetchConsumableUnits` always uses the multicall/direct read path: unit-capped offers read only
`consumed`, while asset-capped offers read `consumed` and `settlementFee` together before delegating
to `ConsumableUnitsLib`. SDK validation and math errors are applied outside the deployless-read
catch path so they are not mistaken for deployless transport failures.

Public fetch helpers:

- `fetchMarketParams`, which returns immutable `MarketParams`
- `fetchMarket`, which reads `toMarket` plus `marketState` and returns a hydrated `Market`
- `fetchPosition`, which reads the Solidity position getter plus every fixed collateral slot and
  returns a `Position`
- `fetchAccrualPosition`, which fetches `Position` and hydrated `Market` in parallel and returns an
  `AccrualPosition`
- `fetchConsumableUnits`, which reads `consumed` and, for asset-capped offers, `settlementFee`, then
  delegates to `ConsumableUnitsLib`
- `fetchRatifierInfo`, which reads bytecode and delegates classification to
  `RatifierUtils.getRatifierInfo`; it must preserve the EIP-7702 designator rule from the app: no
  code, `0x`, or `0xef0100...` routes through Ecrecover; other code routes through Setter.

Fetch helpers must not mutate state, sign, submit transactions, or import UI/app code.

### Signatures, Payloads, and API Validation

Make-offer flows need reusable utilities, but the SDK should not own a wallet or a UI wizard. Payload
bytes are the final communication medium for onchain publication and log/indexer decoding; offers,
groups, trees, proofs, and ratifier data must be usable without constructing a mempool payload first.

The class-based DX keeps the router SDK's proven composition model while exposing protocol-first
names to integrators and keeping pure utilities available for callers that already have plain
JavaScript objects:

```ts
import {
  EcrecoverRatifier,
  Group,
  MidnightApi,
  Payload,
  Tree,
} from "@morpho-org/midnight-sdk";

const api = new MidnightApi();
const group = Group.create(offers);
const tree = Tree.create({ groups: [group] });

const validation = await api.validateMempoolTree({ tree, chainId });
if (!validation.valid) {
  // App code maps API validation issues to its own UX/error handling.
}

const items = await EcrecoverRatifier.ratify({
  tree,
  chainId,
  verifyingContract: addresses.ecrecoverRatifier,
  signTypedData,
});

const payload = await Payload.encode(items);
const call = Payload.buildSubmissionCall({
  midnightMempool: addresses.midnightMempool,
  payload,
});
```

Pure utility namespaces stay available for object-first integrations:

- `RatifierUtils.getRatifierInfo`
- `OfferTreeUtils.buildOfferTreeDescriptor`
- `OfferTreeUtils.buildOfferTreeRoot`
- `OfferTreeUtils.buildOfferTreeProof`
- `OfferTreeUtils.buildEcrecoverRatificationTypedData` or `OfferTreeUtils.signEcrecoverRatification` with an injected `signTypedData` callback;
- `OfferTreeUtils.encodeEcrecoverRatifierData`
- `OfferTreeUtils.encodeSetterRatifierData`
- `OfferTreeUtils.decodeEcrecoverRatifierData`
- `OfferTreeUtils.decodeSetterRatifierData`
- `OfferTreeUtils.verifyOfferTreeProof`
- `OfferTreeUtils.buildEcrecoverRootCancellationCall`
- `OfferTreeUtils.buildSetterRootApprovalCall`
- `EcrecoverRatifier.typedData`
- `EcrecoverRatifier.ratifierData`
- `EcrecoverRatifier.ratify`
- `SetterRatifier.ratifierData`
- `SetterRatifier.ratify`
- `Payload.encode` / `Payload.decode` for versioned Midnight mempool payload bytes.
- `Payload.buildSubmissionCall` for the final raw `to` + payload call descriptor.
- `MidnightApi` for book, quote, takeable-offer, payload/item/tree validation, and mempool-rule reads, callable directly with the default API URL or as a configured instance.

The app remains responsible for sequencing prompts. The SDK returns typed descriptors for "sign this
typed data", "call this contract", "submit this payload", and "validate this tree/payload".
`Payload` encodes and decodes only the raw mempool wire format as
`version || uint32(gzipLen) || gzip(abi(items))`, with bounded compressed bytes, bounded decoded
bytes, a small attribution-suffix allowance, canonical ABI-byte validation, and a typed
`Payload.DecodeError`.

`MidnightApi` is the public Morpho API HTTP boundary. Direct calls default to `https://api.morpho.org`; configured instances share a custom string-or-`URL` `baseUrl`, injected `fetch`, and `request` options for headers, abort signals, credentials, cache, and similar fetch settings. Custom base URLs are parsed with the standard `URL` API, normalized by clearing search/hash, and joined with SDK-owned endpoint paths. SDK-controlled fields remain fixed: URL path/query, HTTP method, JSON body, `Content-Type: application/json` on POST requests, and an exact `sdk-version` header equal to the `@morpho-org/midnight-sdk` package version. Book, quote, and takeable-offer routes map documented snake_case fields to SDK camelCase interfaces without adding runtime schema validation. Validation normalizes the current API response `{ data: { issues } }` to SDK camelCase data `{ valid, issues }`, where `valid` is derived from `issues.length === 0`; it does not rely on the API echoing a payload. Mempool-rules support is a thin, explicitly version-tolerant boundary: `fetchMempoolRules` may expose the raw paginated `{ cursor, data }` response or a lightly normalized equivalent, but the TIB does not freeze rule field names such as `callbackType`, `tickSpacing`, or `allowedLltvs` until the public rules schema is finalized.

The current public API exposes Books, Maker takes, Mempool validate, and Mempool rules. This implementation wraps those routes directly. No generator is introduced for now because the SDK only needs lightweight API calls; type names stay close to the OpenAPI schema names so a future dev-only generator can replace or verify them if a stable spec URL appears.

### App Action Mapping

The package should make these current app flows straightforward without becoming app-specific:

| Current app flow | Midnight SDK support |
| --- | --- |
| Borrow market order with collateral | `TickLib.rateToPrice`/tick helpers, `TakeAmountsLib` max-units rounding, and `TakeableOffer.createMany`; collateral approval, bundler authorization, and standalone periphery calldata remain caller-owned unless a future helper owns route selection or bound computation |
| Borrow against existing collateral | Same periphery route with empty `CollateralSupply[]`; caller skips collateral approval when collateral amount is zero |
| Supply collateral only | Address helpers from `@morpho-org/morpho-ts`, ABI constants from `@morpho-org/midnight-sdk`, and caller-owned `supplyCollateral` calldata |
| Lend market order | `TakeAmountsLib` min-units rounding and `TakeableOffer.createMany`; loan-token approval, bundler authorization, and standalone periphery calldata remain caller-owned unless a future helper owns route selection or bound computation |
| Borrow limit order | optional caller-owned `supplyCollateral` calldata, `Offer.create` with `buy: false`, `Offer.createGroup`/`Group.create`/`Tree.create`, `RatifierUtils`, `MidnightApi`, `EcrecoverRatifier`/`SetterRatifier`, `OfferTreeUtils` proof/root helpers, and `Payload` only for final mempool publication |
| Lend/multi-limit order | caller-owned loan-token approval to the core Midnight contract, `Offer.create` with `buy: true`, `Offer.createGroup`/`Group.create`/`Tree.create`, `RatifierUtils`, `MidnightApi`, `EcrecoverRatifier`/`SetterRatifier`, `OfferTreeUtils` proof/root helpers, and `Payload` only for final mempool publication |

## Implementation Phases

Status as of the 2026-06-08 implementation review:

- **Shared Morpho TS extraction: expanded.** `MathLib`, `RoundingDirection`, `BigIntish`,
  `ORACLE_PRICE_SCALE`, `UnsupportedChainIdError`, `InvalidBitLengthError`, `DivisionByZeroError`,
  `NegativeValueError`, `assertNonNegative`, and the unified Blue/Midnight address/deployment
  registries live in `@morpho-org/morpho-ts`.
  `@morpho-org/blue-sdk` re-exports extracted symbols from their previous Blue locations where
  compatibility matters, while `@morpho-org/midnight-sdk` imports shared primitives directly from
  `@morpho-org/morpho-ts` and exposes only Midnight-specific utility APIs.

- **Phase 1 - Package skeleton: completed.** `packages/midnight-sdk` has package metadata, TypeScript configs, package-level `AGENTS.md`, public barrel exports, test project wiring, and a changeset.
- **Phase 2 - Contract surface: completed with address deployment deferred and shared registry ownership.** Midnight-specific ABI literals live in `@morpho-org/midnight-sdk`; Midnight address and deployment accessors live in `@morpho-org/morpho-ts`. ABI literals pin `morpho-org/midnight` commit `a7c6da7e70cb216982f6c5d20b46f40b943e67e4`. Production address entries remain empty until reviewed deployment artifacts are available; custom registration covers local and fork deployments meanwhile.
- **Phase 3 - Math and offer utilities: completed.** `TickLib`, `TakeAmountsLib`, `ConsumableUnitsLib`, `MarketUtils`, `Offer`, `TakeableOffer`, `OfferUtils`, and `TakeableOfferUtils` landed with colocated unit tests and property-based tests for tick/price, unit conversion, offer creation through static class methods, offer-group creation, protocol offer-group validation, and API-publication group validation behavior.
- **Phase 4 - Standalone call wrappers: removed from scope.** The package does not export direct core or periphery calldata namespaces. Signature and payload helpers still return neutral `EncodedCall` descriptors from `@morpho-org/morpho-ts` when they own workflow context beyond raw ABI encoding.
- **Phase 5 - Fetch: completed with deployless position reads.** Fetch helpers use named `viem/actions` imports and mock-transport tests; `fetchMarketParams` returns immutable market config, `fetchMarket` returns the hydrated domain `Market` object, `fetchPosition` returns the raw `Position` class, and `fetchAccrualPosition` returns `AccrualPosition` for local `updatePositionView`-equivalent accrual. Primitive single-getter reads remain caller-owned direct viem calls instead of SDK fetch wrappers. `fetchPosition` defaults to deployless reads with direct-read fallback unless callers pass `deployless: "force"` or `deployless: false`; `fetchConsumableUnits` always uses the multicall/direct read path and `fetchRatifierInfo` returns structured ratifier-route metadata from bytecode classification.
- **Phase 6 - Signatures, validation, payloads, and API routes: completed.** `RatifierUtils`, `OfferTreeUtils`, `TreeUtils`, `Group`, `Tree`, `EcrecoverRatifier`, `SetterRatifier`, `Payload`, and `MidnightApi` landed. Public API book/quote/takeable-offer/validation/rules reads are lightweight `fetch` boundaries rather than a runtime router dependency, tree validation is available before signature/root approval, and offer publication remains onchain through `Payload.buildSubmissionCall`. Maker-side utilities include Ecrecover/Setter ratifier-data generation and decoding without constructing payload bytes, local proof verification, Setter root approval descriptors, and Ecrecover root cancellation descriptors.
- **Phase 7 - App adoption: deferred.** Updating the markets-v2 app in `morpho-org/morpho-apps` remains a separate repository change and is not required to land this SDK repo PR.

## Considered Alternatives

### Alternative 1: Integrate Midnight into `morpho-sdk` now

Add `morpho-sdk` actions, entities, client namespaces, and package exports immediately.

**Why rejected:** the high-level action/entity shape is not settled enough. The app still needs lower-level utilities first, and those utilities are useful even if a future `morpho-sdk` integration chooses a different action vocabulary. This does not conflict with keeping Midnight ABI literals in `midnight-sdk` and shared registries in `morpho-ts`.

### Alternative 2: Keep all utilities in the markets-v2 app

Continue implementing Midnight order helpers directly in `morpho-apps`.

**Why rejected:** this duplicates protocol logic, makes app errors the only public contract, and increases the chance of drift in tick rounding, bundle route selection, ratifier handling, and authorization logic.

### Alternative 3: Put Midnight utilities in `blue-sdk`

Extend `@morpho-org/blue-sdk` with Midnight addresses, constants, structs, and math.

**Why rejected:** Midnight is a separate protocol surface with its own lifecycle. Adding it to `blue-sdk` would turn Blue's package into a cross-protocol registry and violate the one-reason-to-exist package rule.

### Alternative 4: Create `midnight-sdk-viem` immediately

Mirror the Blue split from day one with both `@morpho-org/midnight-sdk` and `@morpho-org/midnight-sdk-viem`.

**Why rejected:** a second package may become right later, but it is premature before the utility surface stabilizes. This TIB keeps I/O in explicit boundary modules and allows a later extraction if the viem surface grows.

### Alternative 5: Wrap the app `ActionFlow` API

Expose app-style labels, call requests, signature requests, and success callbacks from `midnight-sdk`.

**Why rejected:** that would couple a protocol package to app UI orchestration. `midnight-sdk` should return neutral call, signature, and validation descriptors.

## Assumptions & Constraints

- Midnight production addresses are pinned only after a reviewed deployment artifact is available. Additional chains are additive updates to the `morpho-ts` Midnight address and deployment registries unless the ABI changes.
- `midnight-sdk` pins the ABI revision used by the app and contracts. If `morpho-org/midnight` `main` differs from the deployed artifact, implementation pins the deployed artifact and documents the source.
- App quote/order sources may provide executable offers directly, or integrations may use the lightweight `MidnightApi` book/quote/takeable-offer routes. Protocol conversion helpers stay independent from app code and router runtime packages.
- Public API payload validation and rule inspection are wrapped by `MidnightApi`. If a future PR adds `@morpho-dev/router`, it must justify the dependency and keep it wrapped behind `midnight-sdk` APIs.
- Fetch helpers use transport-bound unit tests via `createMockClient` from `@morpho-org/test/mock`. Fork tests are required when a helper's correctness depends on live contract behavior rather than request/response shape.
- All exported symbols require JSDoc and explicit `src/index.ts` re-exports.

## Dependencies

- `viem` as a peer dependency for ABI encoding, typed data, bytecode reads, and explicit fetch-boundary helpers.
- `@morpho-org/morpho-ts` as a workspace peer dependency for directly imported shared SDK primitives, `MathLib`, shared constants, typed errors, assertions, and generic helpers. `midnight-sdk` does not depend on `blue-sdk` for these symbols and does not ask app consumers to import them through `midnight-sdk`.
- `@morpho-org/test` as a dev dependency for mock-transport tests.
- `fast-check` as a dev dependency for property-based tests.
- No runtime `@morpho-dev/router` dependency in the initial implementation; public API routes use the Morpho API HTTP boundary through global or injected `fetch`.

## Security

- Future bundle workflow helpers must preserve `maxBuyerAssets`, `minSellerAssets`, `minUnits`, `maxUnits`, referral fee handling, and empty-withdrawal/empty-collateral semantics exactly.
- Bundler skip semantics belong with any future high-level bundle workflow helper. Individual failed `take` calls may be skipped by the periphery bundler, but aggregate fills must still satisfy the user's bound; SDK tests for that behavior belong with the helper that owns route selection and bound computation.
- Authorization is explicit. SDK helpers must not silently grant authorization; any wallet flow that needs `setIsAuthorized` must expose that call deliberately.
- Permit data types distinguish `PermitKind.None`, `PermitKind.ERC2612`, and `PermitKind.Permit2`. Encoded `TokenPermit` shape tests are deferred until permit helpers land.
- Signature helpers must never own wallet state. They accept injected signing callbacks or return typed data descriptors.
- Validation helpers must surface typed errors. No SDK source should throw plain `Error`.
- Tick/price and units/assets helpers must be byte-for-byte compatible with the deployed Solidity math where they claim parity.

## Future Considerations

- A future `@morpho-org/midnight-sdk-viem` package if fetch/read helpers grow beyond a small boundary surface.
- A future high-level `@morpho-org/morpho-sdk/midnight` entrypoint once action/entity names and workflow semantics stabilize.
- Higher-level bundle workflow helpers only if app adoption needs SDK-owned route selection and bound computation; not one-to-one calldata wrappers.
- A typed quoter/orderbook SDK for fetching executable offers.
- Multi-chain Midnight address entries.
- Liquidation, flash-loan, fee/admin, and callback utilities.

## Open Questions

- What exact reviewed deployed addresses should populate the first production registry entry for the core Midnight contract, periphery bundler, Midnight mempool, Ecrecover ratifier, and Setter ratifier, and should the chain reuse an existing shared Permit2 entry or add one?
- Once production addresses are pinned, which fetch helpers need fork tests because their correctness depends on live contract behavior rather than request/response shape?
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
- Morpho API mempool validation endpoint: `POST https://api.morpho.org/v1/midnight/mempool/validate`
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
