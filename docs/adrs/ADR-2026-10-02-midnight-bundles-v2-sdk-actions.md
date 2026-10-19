# ADR-2026-10-02: Route Midnight actions through MidnightBundlesV2

| Field      | Value                                                                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Status** | accepted                                                                                                                                 |
| **Date**   | 2026-10-02                                                                                                                               |
| **Author** | @jinmel                                                                                                                                  |
| **Scope**  | Packages and target versions: `morpho-sdk` 7.0.0, `midnight-sdk` 2.0.0, `morpho-ts` 4.0.0, `blue-sdk` 8.0.0, `evm-simulation` next major |

_Status is the only field that changes after acceptance._

## Context

`client.morpho.midnight(chainId)` sent its taker flows (`takeLend`, `takeBorrow`,
`supplyCollateralTakeBorrow`, `repayWithdrawCollateral`) through `MidnightBundlesV1`. Its maker
flows did not use a bundle: they returned approval, ratifier-authorization and root-ratification
prerequisites, then one mempool publication transaction, so creating, funding and replacing offers
took several transactions with no atomicity.

`MidnightBundlesV2` replaced V1 at the contract level. It has five entrypoints: one maker entrypoint
(`midnightBundlesV2CancelAndMake`) and four taker entrypoints (buy or sell, each with a units target
or an assets target). Each entrypoint serves several product intents, selected by its arguments:
the same maker call cancels groups, publishes offers, parks loan assets on Blue or supplies
collateral depending on which inputs are empty; the same buy call lends, repays through offers, or
repays directly depending on `reduceOnly`, `repayEnabled` and `offerFills`. V2 also dropped V1's
`taker` argument and inline token permits: every entrypoint acts for `msg.sender`, pulls tokens with
plain ERC-20 allowances, and requires the caller to have authorized the bundle on Midnight.

V2 is a complete replacement for V1, not a second route next to it. Keeping both routes would leave
integrators choosing between two contracts for the same intent, and exposing the five entrypoints
raw would push the argument combinations that encode each intent onto every integrator.

## Decision

`MidnightBundlesV2` is the only bundle route of the `morpho-sdk` 7.0.0 Midnight surface. It replaces
`MidnightBundlesV1` in every migrated flow; the 7.0.0 major carries no V1 route, route flag or
fallback, and the V1 contract symbols leave the packages that export them. The change ships as the
`morpho-sdk` 7.0.0, `midnight-sdk` 2.0.0, `morpho-ts` 4.0.0 and `blue-sdk` 8.0.0 majors with no
deprecation window: the migrated flows change in place and the V1 symbols are removed, with no
deprecated V1 variant and no coexistence minor before them. Products that need V1 stay on the
previous majors (`morpho-sdk` 6.x, `midnight-sdk` 1.x, `morpho-ts` 3.x, `blue-sdk` 7.x), which
remain published.

### One action per intent

The SDK exposes one entity method per product intent, not per entrypoint. Each method fixes the
intent-selecting arguments and exposes only the inputs that vary within that intent. Each taker
intent has its own pure action builder; the maker intents share the `midnightCancelAndMake` builder,
whose arguments the entity methods fill.

| Entity method | Pure action builder | Entrypoint | Fixed arguments |
| --- | --- | --- | --- |
| `cancelOffers` | `midnightCancelAndMake` | `CancelAndMake` | `newRoot = 0`, `assetsToPark = 0`, no collateral supplies |
| `makeLend` | `midnightCancelAndMake` | `CancelAndMake` | lend-side offers, `assetsToPark = 0`, no collateral supplies |
| `makeBorrow` | `midnightCancelAndMake` | `CancelAndMake` | borrow-side offers, `assetsToPark = 0`, no collateral supplies |
| `supplyBlueMakeLend` | `midnightCancelAndMake` | `CancelAndMake` | lend-side offers whose callback is the maker's derived `BlueBuyCallback`, `assetsToPark > 0` |
| `supplyCollateralMakeBorrow` | `midnightCancelAndMake` | `CancelAndMake` | borrow-side offers, non-empty collateral supplies, `assetsToPark = 0` |
| `makeWithdraw` | `midnightCancelAndMake` | `CancelAndMake` | reduce-only sell offers (`buy = false`), `assetsToPark = 0`, no collateral supplies |
| `makeRepay` | `midnightCancelAndMake` | `CancelAndMake` | reduce-only buy offers (`buy = true`), `assetsToPark = 0`, no collateral supplies |
| `takeLend` | `midnightTakeLend` | `BuyWith{Units,Assets}Target…` | `reduceOnly = false`, `repayEnabled = false`, no collateral withdrawals |
| `takeRepayWithdrawCollateral` | `midnightTakeRepayWithdrawCollateral` | `BuyWith{Units,Assets}Target…` | `reduceOnly = true`, non-empty `offerFills`; `repayEnabled` is an input |
| `repayWithdrawCollateral` | `midnightRepayWithdrawCollateral` | `BuyWith{Units,Assets}Target…` | `reduceOnly = true`, `repayEnabled = true`, empty `offerFills`; no referral fee; an assets repay encodes `targetBuyerAssets = minUnits = assets`, a full repay encodes `targetUnits = maxUint256` |
| `takeBorrow` | `midnightTakeBorrow` | `SupplyCollateralAndSellWith{Units,Assets}Target` | `reduceOnly = false`, no collateral supplies |
| `supplyCollateralTakeBorrow` | `midnightSupplyCollateralTakeBorrow` | `SupplyCollateralAndSellWith{Units,Assets}Target` | `reduceOnly = false`, non-empty collateral supplies |
| `takeWithdraw` | `midnightTakeWithdraw` | `SupplyCollateralAndSellWith{Units,Assets}Target` | `reduceOnly = true`, no collateral supplies |

Public signatures. Each pure builder `midnightX` takes `MidnightXParams` and returns
`Readonly<Transaction<MidnightXAction>>`; `buildTx()` takes no signature argument.

```ts
type MidnightBuyTarget =
  | { readonly type: "assets"; readonly assets: bigint; readonly minUnits: bigint }
  | { readonly type: "units"; readonly units: bigint; readonly maxBuyerAssets: bigint };
type MidnightSellTarget =
  | { readonly type: "assets"; readonly assets: bigint; readonly maxUnits: bigint }
  | { readonly type: "units"; readonly units: bigint; readonly minSellerAssets: bigint };
type MidnightRepay =
  | { readonly type: "assets"; readonly assets: bigint }
  | { readonly type: "full"; readonly maxBuyerAssets: bigint };

interface MidnightRequirementsParams {
  readonly approvalAmount?: bigint;
}
// `MidnightActionOutput` assigns these options to `ActionOutput`'s third type parameter.
type MidnightActionOutput<TAction extends BaseAction, TSignatures = undefined> =
  ActionOutput<TAction, TSignatures, MidnightRequirementsParams>;

// Every taker and maker params type has a required `readonly deadline: bigint`, the bundle
// deadline, with no default. `maxUint256` means no expiry only for flows that accept it.
// The `takeLend`, `takeBorrow`, `supplyCollateralTakeBorrow`, `takeWithdraw` and
// `takeRepayWithdrawCollateral` builders reject it; those entity methods require a future deadline
// at most `MIDNIGHT_TAKE_MAX_DEADLINE_SECONDS` (3,600 seconds) ahead. `repayWithdrawCollateral`
// and maker/cancellation methods still accept it for no expiry.
// Taker methods. Buys take `target: MidnightBuyTarget`, sells `target: MidnightSellTarget`;
// the offers to fill are `takeableOffers: readonly MidnightTakeableOffer[]`.
takeLend(p: TakeLendParams): MidnightActionOutput<MidnightTakeLendAction>;
takeRepayWithdrawCollateral(p: TakeRepayWithdrawCollateralParams):
  MidnightActionOutput<MidnightTakeRepayWithdrawCollateralAction>;
repayWithdrawCollateral(p: RepayWithdrawCollateralParams): // repay: MidnightRepay
  MidnightActionOutput<MidnightRepayWithdrawCollateralAction>;
takeBorrow(p: TakeBorrowParams): MidnightActionOutput<MidnightTakeBorrowAction>;
supplyCollateralTakeBorrow(p: SupplyCollateralTakeBorrowParams):
  MidnightActionOutput<MidnightSupplyCollateralTakeBorrowAction>;
takeWithdraw(p: TakeWithdrawParams): MidnightActionOutput<MidnightTakeWithdrawAction>;

// Maker methods.
makeLend(p: MakeLendParams): Promise<MakeOffersOutput>;
makeRepay(p: MakeLendParams): Promise<MakeOffersOutput>;
makeBorrow(p: MakeOffersParams): Promise<MakeOffersOutput>;
makeWithdraw(p: MakeOffersParams): Promise<MakeOffersOutput>;
supplyBlueMakeLend(p: SupplyBlueMakeLendParams): Promise<MakeOffersOutput>;
supplyCollateralMakeBorrow(p: SupplyCollateralMakeBorrowParams): Promise<MakeOffersOutput>;
cancelOffers(p: {
  readonly accountAddress: Address;
  readonly cancellations: readonly MidnightGroupCancellation[]; // { group, maxConsumed }
  readonly deadline: bigint;
}): MidnightActionOutput<MidnightCancelAndMakeAction>;

interface MakeOffersOutput extends MidnightActionOutput<MidnightCancelAndMakeAction> {
  readonly groups: readonly Hex[];
  readonly root: Hex;
  readonly ratifierType: "priceV1" | "rateV1";
}
// MidnightCancelAndMakeParams.publication.rootSignature?: MidnightRootActivationSignature
```

Rules shared by the taker actions:

- The amount target is a discriminated union, `{ type: "assets", … } | { type: "units", … }`, which
  selects the assets-target or units-target entrypoint. Each arm carries its own aggregate bound:
  on buys, the assets arm takes `minUnits` and the units arm `maxBuyerAssets`; on sells, the assets
  arm takes `maxUnits` and the units arm `minSellerAssets`.
  `repayWithdrawCollateral` takes no offers, so its target is instead
  `repay: { type: "assets", assets } | { type: "full", maxBuyerAssets }`. `assets = 0` encodes a
  withdraw-only call. It takes no referral fee, so an assets repay repays exactly `assets`, and
  `minUnits = assets` because a direct repay counts one unit per asset. It rejects `assets = 0`
  with no non-zero collateral withdrawal, since that call does nothing.
- `reduceOnly` and `repayEnabled` are never free inputs of a lending or borrowing action; only
  `takeRepayWithdrawCollateral` exposes `repayEnabled`, as its direct-repayment fallback.
- Referral fee (`referralFeePct`, `referralFeeRecipient`) is an optional input on every taker action
  except `repayWithdrawCollateral`, and defaults to no fee. `maxContinuousFee` is an input only on
  buy actions, because the sell entrypoints do not accept it.
- Sell actions account for V2 withdrawing the sender's existing credit before taking offers, so a
  borrow by a sender with credit nets that credit first.
- `supplyCollateralTakeBorrow` rejects an empty collateral-supply list, so it never encodes the same
  call as `takeBorrow`. `takeRepayWithdrawCollateral` rejects an empty `offerFills` list, so it
  never encodes the same call as `repayWithdrawCollateral`.
- Collateral supplies and withdrawals are lists of `{ collateralIndex, assets }`; `maxUint256`
  `assets` on a withdrawal means the sender's full balance at execution.

Rules shared by the maker actions:

- Group cancellation is a list of `{ group, maxConsumed }`; an empty list publishes without
  cancelling. The list rejects a repeated group, and replacement offers must use group IDs not
  present in it.
- Maker entity methods accept only PriceRatifierV1 or RateRatifierV1 trees and activate the root
  with the chain's registered ratifier for that tree type. With a non-zero `newRoot`,
  MidnightBundlesV2 grants the ratifier full Midnight authorization over the sender and has no
  allowlist, so the pure `midnightCancelAndMake` builder also accepts only the chain's registered
  `priceRatifierV1` or `rateRatifierV1` and throws `UnsupportedMidnightAuthorizationTargetError`
  otherwise, the same error `midnightSetIsAuthorized` throws for an unsupported grant target.
  Entity methods reject offers whose ratifier differs from the activated ratifier, including
  mixed-ratifier trees.
- Entity methods encode `v = r = s = 0` and zero signature height, nonce and deadline for every
  maker, including EOAs and contract wallets. Root activation relies on the maker's Midnight
  authorization of `MidnightBundlesV2`; ratifier authorization, root activation and payload
  publication happen inside the bundle call. No separate root-signature requirement exists.
  The pure `midnightCancelAndMake` builder still accepts an explicit delegated root signature.
- Every publishing maker method rejects an empty offer set, so it always activates a non-zero
  root; `cancelOffers` is the only method that cancels without a replacement, and it rejects an
  empty cancellation list.
- `makeBorrow` takes no collateral. `supplyCollateralMakeBorrow` requires
  `collateral: { market, supplies }` and rejects an empty collateral-supply list.
- `supplyBlueMakeLend` rejects `assetsToPark = 0`, so it cannot encode the same call as `makeLend`.
  It rejects any offer whose callback is not the `BlueBuyCallback` derived for `accountAddress`,
  so parked assets always back the published offers.
- The root and publication payload are derived deterministically from the offers input. Two
  handles built from the same inputs encode the same transaction without shared mutable state,
  as required by ADR-2026-09-23-stateless-entity-flows.

### Dedicated maker limit exits

`makeWithdraw` publishes lend limit exits: sell existing credit with `buy = false` and
`reduceOnly = true`. `makeRepay` publishes borrow limit exits: buy credit to reduce existing debt
with `buy = true` and `reduceOnly = true`. Both reject any offer with the wrong side or without
`reduceOnly`, including mixed trees. They preserve the supplied tree and group caps instead of
rewriting offers after their root has been computed. Markets app uses `maxUnits` caps for these exits.

The `make` prefix means publishing a resting offer; `Withdraw` and `Repay` name the position
change at fill time. These methods share `midnightCancelAndMake` with the other maker intents,
without introducing new Action-layer interfaces or builders. `makeWithdraw` uses
`MakeOffersParams`; `makeRepay` uses `MakeLendParams`, including `loanToken`, `loanAssets` and
`reservedLoanAssets`. This reuses the existing parameter shapes rather than exporting aliases.
Both accept PriceRatifierV1 and RateRatifierV1 trees and optional guarded group cancellations.
Entity methods need no separate root signature.

Publication does not execute the exit. A later taker fill sells credit or offsets debt, with
`reduceOnly` enforced against the maker's position at fill time. A stale offer cannot open the
opposite position; a fill may revert rather than automatically clamp to the remaining position.
Neither method withdraws collateral, redeems credit directly, supplies collateral, or parks assets
on Blue. These methods therefore differ from immediate taker exits and direct repayment.

`makeWithdraw` requires only Midnight authorization of MidnightBundlesV2. `makeRepay` also
requires a loan-token approval to Midnight (unlimited by default, lowerable with `approvalAmount`) when the allowance is below `loanAssets + reservedLoanAssets`, as in `makeLend`.
For grouped alternative offers, callers reserve the group's loan budget once, not once per leg.
Midnight pulls these loan assets when an offer fills; the publication bundle pulls none.

`makeLend` and `makeBorrow` keep their names but are not unchanged: they apply the shared maker
rules above and reject reduce-only offers, so they never encode the same call as `makeRepay` or
`makeWithdraw`. `supplyBlueMakeLend` and `supplyCollateralMakeBorrow` reject reduce-only offers
too, so no call mixes funding with an exit. All return `MakeOffersOutput`.

### Every entrypoint acts for the sender

Every V2 action is executed by the account whose position it changes. Requirement resolution and
encoding follow from that:

- Action inputs name that account as `accountAddress`; there is no `taker`, `onBehalf` or `maker`
  input distinct from the sender. Maker actions reject offers whose maker is not `accountAddress`.
- Token requirements for the bundle call are ERC-20 approvals from `accountAddress` to
  `MidnightBundlesV2`, returned when the allowance is below the total the call pulls in that
  token: `targetBuyerAssets` on an assets-target buy, `maxBuyerAssets` on a units-target buy,
  each collateral supply, and `assetsToPark`, summed per token. By default, approvals set an
  unlimited allowance (`maxUint256`, or the token's `MAX_TOKEN_APPROVALS` cap, such as `maxUint96`
  for tokens that reject a `maxUint256` approval). `getRequirements({ approvalAmount })` and
  `getMidnightApprovalRequirements({ approvalAmount })` let callers choose another allowance for
  either spender; it applies to each approved token and must cover that token's pulled total, or
  `ApprovalAmountLessThanSpendAmountError` is thrown. The approval trigger remains allowance below
  the per-token pulled total. Because all V2 token pulls use the same bundle spender and the
  bundle acts only for `msg.sender`, only the account's own bundle calls can spend its allowance.
  It can be reused across those calls instead of requiring a new approval for each action. This
  leaves a standing allowance on `MidnightBundlesV2`, which callers can limit with
  `approvalAmount`. Buy-side referral fees are paid out of the pulled amount, so they do not raise
  the approval trigger. ERC-2612 and Permit2 requirements are not produced, because V2 accepts no
  inline permit.
- A full repay (`targetUnits = maxUint256`) still sets a finite `maxBuyerAssets` at or above the
  sender's debt; the unused remainder is returned.
- Lend offers that the maker funds directly (`makeLend`) keep the maker's loan-token
  approval to `midnight`, required when the allowance is below the offered and reserved loan
  assets and set to the same unlimited amount by default. Midnight pulls those tokens from the
  maker when an offer is taken, so all of the account's offers share the same `midnight` allowance.
  Offers funded through the Blue callback do not need it.
- Every V2 action requires `accountAddress` to have authorized `MidnightBundlesV2` on Midnight;
  `getRequirements()` returns that authorization when it is missing. `MidnightBundlesV2` is added
  as an authorization target. For grants, `getMidnightAuthorizationRequirement` and
  `midnightSetIsAuthorized` no longer accept the V1 `midnightBundles`, EcrecoverRatifier or
  SetterRatifier, so `MidnightBundlesV2` is the only accepted target. They do not accept
  PriceRatifierV1 or RateRatifierV1 either: the bundle itself authorizes the V1 ratifier.
  Revocations through `midnightSetIsAuthorized` (`isAuthorized: false`) still accept any
  operator.
- V2 flows that can pull wNative accept optional `nativeAmount`, sent as transaction `value`, with
  the chain's registered wNative passed as `wrappedNative`. With no amount or `0n`, the transaction
  uses `value = 0` and `wrappedNative = zeroAddress`. The bundle wraps all `msg.value` and transfers
  it to `msg.sender` before pulling; any wrapped native not pulled stays in the sender's wallet as
  wNative. The amount cannot exceed the call's total wNative pull (for example, `target.assets` or
  `repay.assets` on an assets target, `maxBuyerAssets` on units or full targets, or the wNative
  supplied for parking or collateral); positive amounts are rejected when no wNative is pulled.
  The wNative approval to `MidnightBundlesV2` is still required for the full pull.

### Blue-funded lend offers

`supplyBlueMakeLend` parks loan assets on Morpho Blue for a `BlueBuyCallback` that the maker owns.
When an offer is taken, the callback withdraws the bought assets from Blue and pays Midnight.

- The callback address is computed offline as the CREATE2 address that the chain's
  `midnightBlueBuyCallbackFactory` deploys for the maker and `callbackSalt`. It uses the
  `BlueBuyCallback` creation bytecode pinned in `morpho-sdk`. No RPC call is made, and the address
  is known before the callback exists. The cost is that the pinned bytecode must match what the
  deployed factories create, so redeploying a factory or changing the callback's bytecode requires
  updating it.
- Every offer's `callback` must be that address, and its `callbackData` must be
  `abi.encode(blueMarket)`. The bundle creates the callback when it is missing.
- The bundle does not check the supply share price, so the SDK checks the parking market before
  building the transaction. It rejects a market with no supply shares, where the first depositor
  sets the share price, and an `assetsToPark` that would mint zero shares. The share preview uses
  the market with interest accrued to the current time. When the SDK cannot accrue the market's
  IRM, the preview uses the market's last-updated state. No other share-price bound is enforced;
  choosing a market whose share price is safe remains the caller's responsibility.

### Public surface and semver

- `midnight-sdk` 2.0.0 adds `midnightBundlesV2Abi` and the V2 struct types. `morpho-ts` 4.0.0 adds
  the `midnightBundlesV2` address and deployment-block keys per chain. `morpho-sdk` re-exports
  `midnightBundlesV2Abi` from `/midnight/abis` and `/abis`, and the V2 struct types under their raw
  names from `/midnight/types` and under `Midnight`-qualified aliases from `/types`.
  `CollateralTransfer` (`MidnightCollateralTransfer`) is the one type for collateral supplies and
  withdrawals in action inputs; the V1 `MidnightCollateralSupply`, which carried the inline permit,
  is removed.
- The V1 contract symbols are removed, not deprecated: `midnightBundlesAbi` from `midnight-sdk` and
  its `morpho-sdk` re-exports, and the `midnightBundles` address and deployment-block keys from
  `morpho-ts`. `blue-sdk` re-exports the `morpho-ts` address and deployment registries and their
  types, so the removal makes it a major too, and `morpho-sdk` 7.0.0's `/addresses` and
  `/blue/addresses` re-export those narrowed registries and types, so the keys leave `morpho-sdk`
  as well. `morpho-sdk` 7.0.0 also replaces the V1 bundle with V2 as an approval spender:
  `"midnightBundles"` leaves `RequirementSpenderKey`, the `midnightBundles` field leaves
  `UnsupportedErc20ApprovalSpenderError`, and `encodeErc20Approval`, `encodeErc20Permit` and
  `getMidnightApprovalRequirements` throw `UnsupportedErc20ApprovalSpenderError` for the V1 bundle
  address. `"midnightBundlesV2"` joins `RequirementSpenderKey`, and `encodeErc20Approval` and
  `getMidnightApprovalRequirements` accept the chain's `midnightBundlesV2` address as spender;
  `UnsupportedErc20ApprovalSpenderError` gains no V2 field and lists the accepted addresses in
  `supportedSpenders`. `encodeErc20Permit` gets no V2 spender because MidnightBundlesV2 takes no
  permits. They go with the route because no action in these majors targets V1; keeping them
  exported would leave the second route reachable through the low-level surface.
- `evm-simulation`'s bundle-retention guard, which fails a simulation that leaves funds in a bundle
  contract, restricts the chain's `midnightBundlesV2` address in place of `midnightBundles`.
  Dropping V1 coverage is deliberate: V2 replaces V1 completely, and V1 consumers stay on the
  previous majors, including the previous `evm-simulation` major. The guard reads addresses
  through `blue-sdk`, so the change ships in the first `evm-simulation` major that depends on
  `blue-sdk` 8.0.0.
- `morpho-sdk` 7.0.0 keeps the established method names of the migrated flows (`takeLend`,
  `takeBorrow`, `supplyCollateralTakeBorrow`, `repayWithdrawCollateral`, `makeLend`, `makeBorrow`
  and `supplyCollateralMakeBorrow`) and retypes their inputs, action `args`, requirement spenders
  and authorization targets for V2. Removed taker inputs include `taker`, inline permits and
  single-amount targets replaced by the target union (`repayAssets` by the `repay` union).
  The V1-only permit types `PermitKind` and `MidnightTokenPermit` are removed with them.
  The four V1 taker flows keep their action names.
- `makeLend`, `makeBorrow` and `supplyCollateralMakeBorrow` replace the mempool publication route
  in place, with no deprecated variant or coexistence minor. Each accepts optional cancellations
  and returns the retyped `MakeOffersOutput`, backed by the shared `midnightCancelAndMake` action.
  No `cancelAndMakeLend` or `cancelAndMakeBorrow` entity method is introduced.
  `supplyCollateralMakeBorrow` replaces `market`, `collateralAssets` and `collateralIndex` with
  required `collateral: { market, supplies }`, and removes `reservedCollateralAssets` because
  collateral is supplied inside the bundle call, so the approval requirement depends only on the
  supplied assets.
- The route-specific surface is removed with them: `mempoolSubmitOffers`
  (`MempoolSubmitOffersParams`, `MempoolSubmitOffersAction`),
  `setterRatifierRatifyRoot` (`SetterRatifierRatifyRootParams`,
  `SetterRatifierRatifyRootAction`), `getSetterRatifierRatifyRootRequirement`
  (`GetSetterRatifierRatifyRootRequirementParams`), the
  `MidnightOfferRootSignature*`, `MidnightOfferRootRequirement` and `MidnightActionSignatures`
  types, `isMidnightOfferRootSignature`, the `midnightOfferRoot` slot of
  `selectRequirementSignatures` (`SelectedRequirementSignatures`), the
  `"midnightOfferRootSignature"` member of `RequirementSignatureKind`, the offer-root signature
  errors (`MissingMidnightOfferRootSignatureError`, `MidnightOfferRootMismatchError`,
  `MidnightOfferRootOwnerMismatchError`, `MidnightOfferRootRatifierMismatchError`,
  `MidnightOfferRootOfferCountMismatchError`, `UnpreparedMidnightOfferRootSignatureError`), and
  `UnknownMidnightRatifierError`, which the `MidnightMakerTreeInput` type makes unreachable.
- Each rejection in the Invariants throws a typed error. Reused: `MidnightOfferMakerMismatchError`,
  `UnsupportedMidnightAuthorizationTargetError` (unregistered ratifier on the pure builder),
  `MidnightOfferSideMismatchError`, `EmptyMidnightTakeableOffersError` (empty `offerFills`),
  `InvalidTreeError` (empty offer set), `NonPositiveInputError` (`assetsToPark = 0`, no-op
  repay, or non-positive taker floors), `NegativeInputError` (negative `maxConsumed` or
  `nativeAmount`), `ApprovalAmountLessThanSpendAmountError` (approval override below the pulled
  total), `ExpiredDeadlineError` (expired bounded take deadline), `InputExceedsMaxError`
  (`maxConsumed` above `uint128` or `nativeAmount` above the total wNative pull),
  `ChainWNativeMissingError`, and `NativeAmountOnNonWNativeAssetError`. Added:
  `MidnightOfferRatifierMismatchError` (wrong or mixed ratifier),
  `MidnightReplacementGroupCancelledError`, `DuplicateMidnightGroupCancellationError`,
  `EmptyMidnightGroupCancellationsError` (empty `cancelOffers`), `EmptyMidnightCollateralSuppliesError`,
  `MidnightOfferCallbackMismatchError` and `MidnightOfferCallbackDataMismatchError` (wrong
  `BlueBuyCallback`), `EmptyBlueParkingMarketError` (Blue market with no supply shares),
  `ZeroBlueParkingSharesError` (`assetsToPark` that mints zero shares),
  `MidnightOfferNotReduceOnlyError` (exit offer without `reduceOnly`) and
  `MidnightOfferReduceOnlyError` (reduce-only offer on a maker method that is not an exit),
  `MidnightOfferContinuousFeeCapError` (maker offer has a nonzero `continuousFeeCap`),
  `MidnightOfferSellerReceiverMismatchError` (a sell offer routes proceeds to another address),
  `UnboundedMidnightTakeInputError` (an unbounded take target or deadline),
  `MidnightZeroReceiverError` (zero taker `receiver`, or zero `collateralReceiver` when
  `repayWithdrawCollateral` or `takeRepayWithdrawCollateral` withdraws collateral; `field` is
  `"receiver" | "collateralReceiver"`), and `MidnightTakeDeadlineTooFarError`.
- `MidnightActionOutput` binds `MidnightRequirementsParams` to `ActionOutput`'s third type
  parameter, so `getRequirements(params?: MidnightRequirementsParams)` accepts
  `approvalAmount?: bigint`. `GetMidnightApprovalRequirementsParams` adds optional
  `approvalAmount` to `getMidnightApprovalRequirements`; both default to `maxUint256`, capped per
  token by `MAX_TOKEN_APPROVALS`, and reject an override below the token's pulled total with
  `ApprovalAmountLessThanSpendAmountError`.
- `takeLend`, `takeBorrow`, `supplyCollateralTakeBorrow`, `takeWithdraw` and
  `takeRepayWithdrawCollateral` builders reject `maxUint256` deadlines with
  `UnboundedMidnightTakeInputError`. `takeWithdraw` also rejects `maxUint256` for `target.units` and
  `target.maxUnits`; the other three take builders reject their unbounded target fields.
  `takeRepayWithdrawCollateral` keeps `target.units: maxUint256` as the whole-debt sentinel, with
  the pull capped by finite `maxBuyerAssets`. These entity methods require a future deadline no more
  than `MIDNIGHT_TAKE_MAX_DEADLINE_SECONDS` (`3600n`) ahead, throwing `ExpiredDeadlineError` when
  expired and `MidnightTakeDeadlineTooFarError` beyond the window. `repayWithdrawCollateral` and
  maker/cancellation flows still accept `maxUint256` for no expiry.
- `takeLend`, `takeBorrow`, `supplyCollateralTakeBorrow`, `takeWithdraw` and
  `takeRepayWithdrawCollateral` require positive minimum bounds (`minUnits` or `minSellerAssets`)
  where those fields apply. `takeBorrow` and `supplyCollateralTakeBorrow` also reject a zero
  `receiver`. Entity methods that prepare maker offer trees reject nonzero `continuousFeeCap`; a
  sell offer's `receiverIfMakerIsSeller` must equal its maker.
- V2 flow inputs that can pull wNative add optional `nativeAmount`. A positive amount requires a
  configured wNative token and cannot exceed the total wNative pull; when there are other token
  pulls but no wNative, `NativeAmountOnNonWNativeAssetError` is thrown, and a positive amount with
  no pulls exceeds the zero maximum. The helper uses `ChainWNativeMissingError`,
  `NativeAmountOnNonWNativeAssetError`, `NegativeInputError` and `InputExceedsMaxError` for these
  cases.
- `getMidnightAuthorizationRequirement` and `midnightSetIsAuthorized` narrow their ratifier
  grant targets: the V1 `midnightBundles`, EcrecoverRatifier and SetterRatifier are removed and
  `MidnightBundlesV2`, the only accepted grant target, is added. Revocations still accept any
  operator.
- `blue-sdk` 8.0.0 and `midnight-sdk` 2.0.0 narrow their `morpho-ts` peer to `^4.0.0`. Maintained
  dependents outside these majors need peer-range widening and their own release: `blue-sdk-viem`
  (`blue-sdk ^7`, `morpho-ts ^3`) and `morpho-test` (`blue-sdk ^6 || ^7`, `morpho-ts ^2.7 || ^3`).
  `wdk-protocol-lending-morpho-evm` takes the workspace versions and is released with them. None of
  them inherits this exception.
- The maker types kept in 7.0.0 are retyped in place: `MakeOffersParams`, `MakeLendParams`, and
  `MakeOffersOutput` keep their v6 export names (`MidnightMakeOffersParams`,
  `MidnightMakeLendParams`, and `MidnightMakeOffersOutput`); `MakeOffersParams` gains a required
  `deadline: bigint` with no default, where `maxUint256` means no expiry; `makeBorrow` continues to
  use
  `MakeOffersParams`, while `SupplyCollateralMakeBorrowParams` extends it with required
  `MidnightMakeBorrowCollateral`; `MorphoMidnight.getOffersData` and the maker `offers` input accept
  only a PriceRatifierV1 or RateRatifierV1 tree (`MidnightMakerTreeInput`)
  instead of any `TreeInput`; `MidnightOfferValidationParams` drops `ratification`;
  `MidnightOffersData.ratifierType` becomes `"priceV1" | "rateV1"` and its `setterPayload` is
  replaced by `payload`; `MidnightSupplyCollateralMakeBorrowParams` requires
  `collateral: MidnightMakeBorrowCollateral`.
- `makeWithdraw`, `makeRepay`, `cancelOffers`, `supplyBlueMakeLend`,
  `takeRepayWithdrawCollateral` and `takeWithdraw` are additions.
- `supplyBlueMakeLend` adds `getMidnightBlueBuyCallbackAddress` and `getMidnightBlueBuyCallbackData`
  to `morpho-sdk`, the `MidnightBlueSupply` action type, and `blueBuyCallbackFactoryAbi` to
  `midnight-sdk`, re-exported by `morpho-sdk` from `/midnight/abis` and as
  `midnightBlueBuyCallbackFactoryAbi` from `/abis`.
- Single-group cancellation also goes through `cancelOffers` (one entry; `maxConsumed = maxUint128`
  disables the limit). The `cancelOffer` entity method, `midnightCancelOffer` builder
  (`MidnightCancelOfferParams`),
  `MidnightCancelOfferAction` metadata type, and `MidnightAmountExceedsMaxOfferCapError` are
  removed. Unlike the direct `Midnight.setConsumed` call it replaces, cancelling one group now
  requires Midnight authorization of `MidnightBundlesV2` and a `deadline`, and the optional
  partial `amount` is gone: `maxConsumed` only bounds how much may already be consumed when the
  cancellation executes. Cancellation lists reject a negative `maxConsumed` with
  `NegativeInputError` and one above `uint128` with `InputExceedsMaxError`.
- The route replacements and removals listed in this record invoke a narrow lifecycle exception,
  added to `AGENTS.md` §7 with this record and accepted by the maintainer (@jinmel). They skip the
  successor-introduction, `@deprecated` and one-minor coexistence steps. Keeping the mempool route
  would preserve a second publication path, its Ecrecover and SetterRatifier signing, and the
  non-atomic collateral-supply/publication flow for intents served atomically by V2. Keeping
  `cancelOffer` would leave two cancellation paths with different requirements and semantics for
  one intent that `cancelOffers` with a single entry already serves. The exception
  does not waive major changesets, migration guides, the maintained-dependent audit and peer-range
  bumps, or continued availability of the previous majors. No removal outside this list inherits it.

This decision does not cover Blue market selection for parked assets beyond the checks above,
quote and offer selection, or any `evm-simulation` change beyond the bundle-retention guard.

## Invariants

- `makeLend`, `makeBorrow`, `supplyBlueMakeLend` and `supplyCollateralMakeBorrow` reject
  reduce-only offers, a cancellation list rejects a repeated group, and `cancelOffers` rejects an
  empty cancellation list → typed-error unit tests.
- `makeWithdraw` and `makeRepay` reject non-reduce-only or wrong-side offers, preserve units caps,
  publish with zero root-signature fields, and resolve only the requirements described above
  → entity unit tests and fork publication tests for both intents.
- Every migrated and added Midnight bundle action targets the chain's `midnightBundlesV2` address
  and encodes a `midnightBundlesV2*` selector → unit tests per action builder.
- No `morpho-sdk` 7.0.0 action encodes a `midnightBundlesV1*` selector → a unit test over every
  Midnight action builder's encoded calldata.
- No package in these majors exports `midnightBundlesAbi` or a `midnightBundles` address or
  deployment-block key → a grep over the published barrels and the address registry tests.
- The `evm-simulation` bundle-retention guard fails a simulation that leaves funds above dust in the
  chain's `midnightBundlesV2` contract → a retention unit test.
- Each action fixes the intent arguments in the table above → encoder tests decode calldata and
  assert `reduceOnly`, `repayEnabled`, `newRoot`, `assetsToPark` and list emptiness per action.
- Requirements for assets the bundle call pulls name `MidnightBundlesV2` as approval spender,
  every V2 action requires Midnight authorization of `MidnightBundlesV2`, and no V2 requirement is
  a permit. Approvals are returned only when the allowance is below the per-token total the call
  pulls (including two pulls of one token whose total exceeds a finite allowance), and by default
  set `maxUint256` or the token's `MAX_TOKEN_APPROVALS` cap. An optional `approvalAmount` on
  `getRequirements` or `getMidnightApprovalRequirements` may lower that allowance but must cover
  the full per-token pull; the same holds for `makeLend` and `makeRepay` approvals to `midnight`
  → requirement unit tests and pinned-fork integration tests per method.
- `takeLend`, `takeBorrow`, `supplyCollateralTakeBorrow`, `takeWithdraw` and
  `takeRepayWithdrawCollateral` builders reject `maxUint256` deadlines with
  `UnboundedMidnightTakeInputError`. `takeWithdraw` also rejects `maxUint256` target units or
  `maxUnits`; the other three take builders reject their unbounded target fields. The
  `takeRepayWithdrawCollateral` units target still accepts `units: maxUint256` for whole debt,
  capped by finite `maxBuyerAssets`. All five require positive minimum bounds where those fields
  apply, and their entity methods accept only future deadlines no more than
  `MIDNIGHT_TAKE_MAX_DEADLINE_SECONDS` (`3600n`) ahead, throwing `ExpiredDeadlineError` when
  expired and `MidnightTakeDeadlineTooFarError` beyond the window. `takeBorrow` and
  `supplyCollateralTakeBorrow` reject a zero receiver with `MidnightZeroReceiverError`, and
  `repayWithdrawCollateral` and `takeRepayWithdrawCollateral` reject a zero `collateralReceiver`
  with it whenever `collateralWithdrawals` is non-empty (a zero receiver with no withdrawals stays
  accepted) → typed-error unit tests.
- Maker offer trees reject nonzero `continuousFeeCap` and sell offers whose
  `receiverIfMakerIsSeller` differs from the maker → typed-error unit tests.
- When a V2 flow supplies `nativeAmount`, it is nonnegative and no greater than the total wNative
  pull; omitted or zero amounts encode `value = 0` and `wrappedNative = zeroAddress`. The bundle
  wraps and returns any unpulled wNative to the sender, while approval still covers the full pull.
  A positive amount requires a configured wNative and a wNative pull → native-funding unit tests
  and requirements integration tests.
- Maker actions reject offers whose maker differs from `accountAddress`, offers whose ratifier is
  not the activated `PriceRatifierV1` or `RateRatifierV1`, replacement groups that are also being
  cancelled, an empty offer set on a publishing action, `assetsToPark = 0` on `supplyBlueMakeLend`,
  an empty collateral-supply list on `supplyCollateralMakeBorrow`, and a `supplyBlueMakeLend` offer
  whose callback is not the maker's derived `BlueBuyCallback` → typed-error unit tests. The pure
  `midnightCancelAndMake` builder rejects a ratifier that is not the chain's registered
  `priceRatifierV1` or `rateRatifierV1` → typed-error unit test.
- `supplyBlueMakeLend` rejects an offer whose `callbackData` is not `abi.encode(blueMarket)`, a Blue
  market with no supply shares, and an `assetsToPark` that previews to zero shares after interest
  accrual → typed-error unit tests.
- The offline callback address equals the address the factory deploys for the same maker and salt
  → a fork test that creates the callback, and fixed-address unit tests per chain. Revisit if a
  `midnightBlueBuyCallbackFactory` is redeployed or the `BlueBuyCallback` bytecode changes.
- Revisit if the bundle adds a share-price bound for parked assets, which would replace the SDK
  check.
- `supplyCollateralTakeBorrow` rejects empty collateral supplies, `takeRepayWithdrawCollateral`
  rejects an empty `offerFills` list, and `repayWithdrawCollateral` rejects a zero repay with no
  non-zero withdrawal → typed-error unit tests.
- No `cancelAndMakeLend`, `cancelAndMakeBorrow`, `mempoolSubmitOffers`, `cancelOffer`,
  `midnightCancelOffer`, `MidnightCancelOfferParams`, `MidnightCancelOfferAction` or `MidnightAmountExceedsMaxOfferCapError`
  export remains in
  `morpho-sdk` 7.x; `makeLend`, `makeBorrow` and `supplyCollateralMakeBorrow` all return the
  retyped `MakeOffersOutput` → public export checks.
- Maker entity methods return no signature requirement and encode all-zero root-signature fields
  → entity unit tests that decode calldata and assert those fields.
- Two handles built from the same inputs produce the same transaction → cross-handle tests on
  maker methods.
- Revisit if a ratifier used by maker flows requires a root signature even when the bundle is
  authorized.
- Revisit if `MidnightBundlesV2` gains an entrypoint, an `onBehalf` argument or inline permits, or
  changes the argument semantics documented at the reviewed contract revision.

## Rejected alternatives

- **Keep V1 as a selectable route in 7.0.0.** Rejected because two routes for the same intent is
  the ambiguity the major removes; the previous majors remain available to V1 consumers.
- **Keep the V1 contract symbols exported and deprecated.** Rejected because they would serve only
  integrators encoding V1 calls by hand, which these majors no longer support, and would keep
  `midnight-sdk`, `morpho-ts` and `blue-sdk` on minors only by deferring the same break to a later
  major.
- **Keep the mempool maker route for a deprecation minor.** Rejected because V2 serves the same
  intents atomically under the established `makeLend` and `makeBorrow` names. A second route would
  retain its separate signing and publication steps and defer the same break to another release.
- **One taker action per entrypoint exposing every argument.** Rejected because the intent is
  encoded in argument combinations (`reduceOnly`, `repayEnabled`, empty lists, zero root) that
  integrators would have to reproduce, and an invalid combination would execute a different product
  action.
- **One pure maker builder per intent.** Rejected because every maker intent calls
  `CancelAndMake` with the same argument meaning, and the offer sides and `reduceOnly` flags sit
  inside the prebuilt root and payload, which a pure builder cannot check without re-decoding them.
  The entity methods enforce the per-intent rules. A caller of `midnightCancelAndMake` can combine
  an exit tree with collateral supplies or Blue parking, so that builder is the low-level escape
  hatch, not the guarded path.
- **Keep `cancelOffer` as the direct Midnight call.** Rejected because `cancelOffers` with one
  entry serves the same intent atomically with a consumption bound; two cancellation paths with
  different requirements would be the ambiguity the major removes. The cost is that a v6 maker
  authorizes `MidnightBundlesV2` once before cancelling, and partial consumption through `amount`
  is no longer offered.
- **Exact-amount approvals.** Rejected because every V2 token pull uses the same
  `MidnightBundlesV2` spender, so a reusable allowance avoids a separate approval transaction
  whenever a later bundle call needs more allowance. This leaves a standing allowance on the
  bundle contract, which callers can limit with `approvalAmount`; unlike that bundle allowance,
  the `midnight` allowance is shared by the account's offers because Midnight pulls offer funds
  when they are taken.
- **Emulate `taker`/`onBehalf` on V2.** Rejected because V2 acts only for `msg.sender`; an input
  naming another account would build transactions that cannot act for it.

## References

- [`ADR-2026-05-20-midnight-sdk-utilities`](./ADR-2026-05-20-midnight-sdk-utilities.md)
  — superseded in part for the `midnightBundles` address and deployment keys and the
  `midnightBundlesAbi` export
- [`ADR-2026-06-03-midnight-action-output-interface`](./ADR-2026-06-03-midnight-action-output-interface.md)
  — superseded in part for the maker mempool route, the `MidnightBundlesV1` taker routes,
  `buildTx(MidnightActionSignatures)`, the offer-root signature types, the cancel-offer action
  (`cancelOffer` / `midnightCancelOffer`), the exact-amount approval policy of
  `getMidnightApprovalRequirements` and the `MidnightBundles` authorization-target list; the lazy
  action output shape is retained.
- ADR-2026-08-25-blue-bundles-v1-sdk-actions — the precedent for replacing a high-level route
  while keeping method names.
- ADR-2026-09-23-stateless-entity-flows — signature-only transport between requirements and
  `buildTx`.
- [`MidnightBundlesV2` at the reviewed revision](https://github.com/morpho-org/bundles/blob/07f293b383824b35adc745454ac2622a27eb0502/src/midnight/MidnightBundlesV2.sol)
  and its [interface](https://github.com/morpho-org/bundles/blob/07f293b383824b35adc745454ac2622a27eb0502/src/midnight/interfaces/IMidnightBundlesV2.sol).
- [`ADR-2026-09-17-remove-bundler3-primitives-without-deprecation`](./ADR-2026-09-17-remove-bundler3-primitives-without-deprecation.md)
  — precedent for removing an unsupported route without a coexistence minor.
- Accepted in the PR that added this file.
