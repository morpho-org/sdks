# Migrating `@morpho-org/morpho-sdk` from v6 to v7

Version 7 publishes Midnight maker offers through MidnightBundlesV2 in one transaction. The v6
flow sent a separate root-ratification transaction or root signature, then posted the offers to
MidnightMempool. v7 removes that route instead of keeping it selectable; stay on v6 if you
still need it.

## Maker methods

| v6 | v7 |
| --- | --- |
| `makeLend` | `makeLend` (retyped) |
| `makeBorrow` | `makeBorrow` (retyped) |
| `supplyCollateralMakeBorrow` | `supplyCollateralMakeBorrow` (retyped) |

Each MidnightBundlesV2 call cancels the groups you are replacing, authorizes the ratifier, activates
the new root, and publishes the payload. `supplyCollateralMakeBorrow` also supplies borrow
collateral in that call; `makeBorrow` does not. If any cancelled group was filled beyond its
`maxConsumed` before the transaction lands, the whole call reverts and nothing is published.

`makeBorrow` still takes `MidnightMakeOffersParams`, which now requires `deadline` and accepts
optional `cancellations` (see below), and does not accept collateral. Use
`supplyCollateralMakeBorrow` to supply collateral; it requires a non-empty
`supplies` list and throws `EmptyMidnightCollateralSuppliesError` for an empty list. Both methods
build the `midnightCancelAndMake` action directly.

```ts
// v6
const output = await midnight.makeLend({ accountAddress, offers, loanToken, loanAssets });
const tx = output.buildTx(await signRequirements(await output.getRequirements()));

// v7: repost over previousGroup; pass `cancellations: []` for a fresh publication
const output = await midnight.makeLend({
  accountAddress,
  offers,
  cancellations: [{ group: previousGroup, maxConsumed: 0n }],
  deadline,
  loanToken,
  loanAssets,
});
const tx = output.buildTx();
```

```ts
// v6
await midnight.supplyCollateralMakeBorrow({ accountAddress, offers, market, collateralAssets });

// v7
await midnight.supplyCollateralMakeBorrow({
  accountAddress,
  offers,
  collateral: { market, supplies: [{ collateralIndex: 0n, assets }] },
  deadline,
});
```

The method returns `MidnightMakeOffersOutput`, whose transaction action is
`midnightCancelAndMake`. Its required `collateral: { market, supplies }` replaces the v6
`market`, `collateralAssets`, and `collateralIndex` inputs; `reservedCollateralAssets` is removed.
An empty `supplies` list throws `EmptyMidnightCollateralSuppliesError`.

## Taker methods

`takeLend`, `takeBorrow` and `supplyCollateralTakeBorrow` now call MidnightBundlesV2. Each takes a
`target` that picks the amount the trade is sized by, and acts for the sender: there is no `taker`
input, and `accountAddress` must send the transaction.

| v6 input | v7 input |
| --- | --- |
| `takeLend` `assets`, `minUnits` | `target: { type: "assets", assets, minUnits }` or `{ type: "units", units, maxBuyerAssets }` |
| `takeBorrow` `loanAssets`, `maxUnits` | `target: { type: "assets", assets, maxUnits }` or `{ type: "units", units, minSellerAssets }` |
| `supplyCollateralTakeBorrow` `collateralAssets`, `collateralIndex` | `collateralSupplies: [{ collateralIndex, assets }]` (non-empty) |
| — | `takeLend` `maxContinuousFee` (required; `maxUint256` for no cap) |
| — | optional `referralFeePct`, `referralFeeRecipient` |
| — | `takeBorrow` and `supplyCollateralTakeBorrow` optional `receiver` (defaults to `accountAddress`) |

```ts
// v6
midnight.takeLend({ accountAddress, marketData, assets, minUnits, takeableOffers, deadline });

// v7
midnight.takeLend({
  accountAddress,
  marketData,
  target: { type: "assets", assets, minUnits },
  takeableOffers,
  maxContinuousFee: maxUint256,
  deadline,
});
```

- Low-level builders: `midnightTakeBorrow` and `midnightSupplyCollateralTakeBorrow` replace `taker`
  with a required `receiver`; `midnightTakeLend` drops `taker` with no replacement.
- Deadlines on `takeLend`, `takeBorrow`, `supplyCollateralTakeBorrow`, `takeWithdraw` and
  `takeRepayWithdrawCollateral` must be greater than now and no more than
  `MIDNIGHT_TAKE_MAX_DEADLINE_SECONDS` (one hour) from now. Builders reject `maxUint256` deadlines
  with `UnboundedMidnightTakeInputError` and `0n` with `NonPositiveInputError`; entity methods
  reject expired deadlines with `ExpiredDeadlineError` and deadlines beyond the window with
  `MidnightTakeDeadlineTooFarError`.
- Target amounts and bounds must be positive. `takeWithdraw` requires a positive `minSellerAssets`
  on units targets and rejects `maxUint256` for `target.units` or `target.maxUnits`.
  `takeRepayWithdrawCollateral` requires positive `minUnits` on assets targets. Its units target
  still allows `units: maxUint256` to repay the whole debt, bounded by finite, positive
  `maxBuyerAssets`; it rejects `maxUint256` for `maxBuyerAssets`. `takeLend`, `takeBorrow`, and
  `supplyCollateralTakeBorrow` reject unbounded target fields with
  `UnboundedMidnightTakeInputError`; `receiver` cannot be the zero address or throws
  `MidnightZeroReceiverError`.
- Maker `continuousFeeCap` must be `0n` or throws `MidnightOfferContinuousFeeCapError`. A sell
  offer's `receiverIfMakerIsSeller` must equal its maker or throws
  `MidnightOfferSellerReceiverMismatchError`.
- Requirements approve the loan token (`takeLend`: `assets` or `maxBuyerAssets`) or each collateral
  token (summed per token) to MidnightBundlesV2, and authorize MidnightBundlesV2 on Midnight.
  Approvals are now unlimited: `getRequirements()`/`getMidnightApprovalRequirements` return a
  `maxUint256` approval (capped per token by `MAX_TOKEN_APPROVALS`) instead of the exact pulled
  amount, still only when the allowance is below the pulled amount. Callers can pass
  `getRequirements({ approvalAmount })` (or `approvalAmount` on
  `getMidnightApprovalRequirements`) to set a different allowance.
- `takeBorrow` and `supplyCollateralTakeBorrow` withdraw the sender's existing credit before
  taking offers, so a lender who borrows nets the credit first.
- Action metadata exposes `target` instead of `assets`/`minUnits` or `loanAssets`/`maxUnits`, and
  drops `taker`. `MidnightSupplyCollateralTakeBorrowAction.collateralSupplies` is the supply list
  instead of a count, and `MidnightTakeBorrowAction.args` no longer has `collateralSupplies`.
- New types: `MidnightBuyTarget`, `MidnightSellTarget`, `MidnightReferralFeeParams`.
  `MidnightCollateralSupply` is removed; use `MidnightCollateralTransfer`.
- New `takeRepayWithdrawCollateral` (and the `midnightTakeRepayWithdrawCollateral` builder) repays
  debt by taking borrow-side offers with `reduceOnly` set, repays the rest directly when
  `repayEnabled` is true, then withdraws `collateralWithdrawals` to `collateralReceiver`
  (default `accountAddress`). It takes a `MidnightBuyTarget` and needs the same approval and
  authorization as `takeLend`.
- New `takeWithdraw` (and the `midnightTakeWithdraw` builder) withdraws the sender's credit: it
  redeems what market liquidity allows, then sells the rest of a `MidnightSellTarget` to lend-side
  offers with `reduceOnly` set, so it never opens debt. It needs only MidnightBundlesV2
  authorization. `redeem` stays the direct, offer-free path.

## Removed MidnightBundles (V1) support

v7 no longer routes anything through the V1 `midnightBundles` contract:

- `midnightBundlesAbi` is no longer re-exported from `@morpho-org/morpho-sdk` or
  `@morpho-org/morpho-sdk/midnight`, and `midnight-sdk` 2.0.0 removes it too. Integrations that
  still call V1 stay on `morpho-sdk` 6.x with `midnight-sdk` 1.x and `morpho-ts` 3.x.
- `RequirementSpenderKey` drops `"midnightBundles"`. `encodeErc20Approval` and
  `getMidnightApprovalRequirements` reject a `midnightBundles` spender, and `encodeErc20Permit` no
  longer signs permits for it (V2 takes no inline permits).
- `midnightSetIsAuthorized` and `getMidnightAuthorizationRequirement` accept only
  `midnightBundlesV2` as the operator to grant. Revocations through `midnightSetIsAuthorized`
  (`isAuthorized: false`) still accept any operator.
- `UnsupportedErc20ApprovalSpenderError` no longer takes a `midnightBundles` constructor field.
- `PermitKind` and `MidnightTokenPermit` are removed with no replacement: V2 takes no inline token
  permits.

## repayWithdrawCollateral

`repayWithdrawCollateral` now calls MidnightBundlesV2 for the sender (no `onBehalf`). It repays
debt directly, without taking offers, and can withdraw several collaterals in the same call.

| v6 input | v7 input |
| --- | --- |
| `repayAssets` | `repay: { type: "assets", assets }` (repays exactly `assets`; `0n` for withdraw-only) or `repay: { type: "full", maxBuyerAssets }` (repays the whole debt at execution time, pulling the finite `maxBuyerAssets` upfront and refunding the rest, so the sender must hold the full cap; reverts with `Panic(0x11)` if the debt at execution exceeds it) |
| `withdrawCollateralAssets`, `collateralIndex` | `collateralWithdrawals: [{ collateralIndex, assets }]` (`assets: maxUint256` withdraws the whole balance) |
| — | optional `collateralReceiver` (defaults to `accountAddress`) |

```ts
// v6
midnight.repayWithdrawCollateral({ accountAddress, marketData, repayAssets, withdrawCollateralAssets, deadline });

// v7: close the position
midnight.repayWithdrawCollateral({
  accountAddress,
  marketData,
  repay: { type: "full", maxBuyerAssets },
  collateralWithdrawals: [{ collateralIndex: 0n, assets: maxUint256 }],
  deadline,
});
```

- Requirements approve the loan token to MidnightBundlesV2 when the allowance is below the pulled
  assets (`assets`, or `maxBuyerAssets` on a full repay; skipped when `0n`) and authorize
  MidnightBundlesV2 on Midnight. Unused assets
  are refunded. A full repay rejects `maxBuyerAssets` of `0n` or `maxUint256`, and an `assets` repay
  rejects `assets: maxUint256` (use `{ type: "full" }` to repay the whole debt).
- `deadline` must be positive: `0n` now throws `NonPositiveInputError` (v6 only rejected negative
  values). Pass `maxUint256` for no expiry.
- `MidnightRepayWithdrawCollateralAction.args` exposes `repay` and the `collateralWithdrawals`
  list, and drops `repayAssets` and `onBehalf`.
- The `midnightRepayWithdrawCollateral` builder takes the same `repay` and `collateralWithdrawals`
  plus a required `collateralReceiver`; it drops `repayAssets`, `withdrawCollateralAssets`,
  `collateralIndex` and `onBehalf`. Like the other V2 builders, it throws `UnknownAddressError`
  on chains without a `midnightBundlesV2` deployment.

## Ratifiers

Offers must use PriceRatifierV1 or RateRatifierV1. Pass a `Tree<"priceV1">`, a `Tree<"rateV1">`,
or the matching tree-create request; every offer's `ratifier` must be the tree's ratifier
(`MidnightOfferRatifierMismatchError`). Ecrecover and Setter trees are no longer accepted by
maker methods. `getOffersData` follows the same rule and now returns the V1 payload and ratifier
address.

## Ownership and requirements

- MidnightBundlesV2 acts on `msg.sender`. `accountAddress` must be the sender and the maker of every
  offer; there is no `onBehalf`.
- `getRequirements()` returns only onchain transactions: the MidnightBundlesV2 Midnight
  authorization, the lend-side loan-token approval to Midnight for later fills, and borrow-side
  collateral approvals to MidnightBundlesV2 for `supplyCollateralMakeBorrow`. `makeBorrow`
  requires only MidnightBundlesV2 authorization. It no longer returns a root signature or a
  SetterRatifier root transaction, so `buildTx()` takes no signatures.
- Replacement offers need fresh groups. A group cannot be both published and cancelled
  (`MidnightReplacementGroupCancelledError`).
- `makeLend`, `makeBorrow`, and `supplyCollateralMakeBorrow` reject `reduceOnly` offers with
  `MidnightOfferReduceOnlyError`.

## Renamed and changed types

| v6 | v7 |
| --- | --- |
| `MidnightMakeOffersParams` | `MidnightMakeOffersParams` (retyped) |
| `MidnightMakeLendParams` | `MidnightMakeLendParams` (retyped) |
| `MidnightSupplyCollateralMakeBorrowParams` | `MidnightSupplyCollateralMakeBorrowParams` (required `collateral`) |
| `MidnightMakeOffersOutput` | `MidnightMakeOffersOutput` (retyped) |
| — | `MidnightMakeBorrowCollateral` |
| — | `MidnightOfferPublication`, `MidnightCancelAndMakeParams`, and `MidnightRootActivationSignature` |

- `MidnightMakeOffersParams`, and so `MidnightMakeLendParams` and
  `MidnightSupplyCollateralMakeBorrowParams`, adds a required `deadline: bigint` bundle execution
  deadline with no default; pass `maxUint256` for no expiry. It also adds optional
  `cancellations: readonly MidnightGroupCancellation[]`; omit it or pass `[]` for a new publication.
- `MidnightMakeOffersParams` is used by `makeBorrow`, as in v6, and does not include collateral.
  `MidnightSupplyCollateralMakeBorrowParams` extends it with required
  `collateral: MidnightMakeBorrowCollateral`. Its nested supplies replace the v6 `market`,
  `collateralAssets`, and `collateralIndex` inputs; `reservedCollateralAssets` is removed. The
  collateral approval now goes to MidnightBundlesV2 instead of Midnight.
- `MidnightCancelAndMakeParams` takes ratifier, root, groups, payload, root signature, and optional
  collateral together under `publication?: MidnightOfferPublication`. Omit `publication` for
  cancel-only calls; this preserves `cancelOffers` behavior.
- `offers` accepts only `MidnightMakerTreeInput` (a PriceRatifierV1 or RateRatifierV1 tree or
  `Tree.create` request) instead of any `TreeInput`.
- `MidnightOfferValidationParams` no longer accepts `ratification`; the ratifier comes from the tree.
- `MidnightOffersData.ratifierType` is `"priceV1" | "rateV1"` instead of `"ecrecover" | "setter"`.
- `MidnightOffersData.setterPayload` is replaced by `payload`, set for every tree.

## Removed exports

- Actions and requirements: `mempoolSubmitOffers` (`MempoolSubmitOffersParams`),
  `setterRatifierRatifyRoot` (`SetterRatifierRatifyRootParams`),
  `getSetterRatifierRatifyRootRequirement` (`GetSetterRatifierRatifyRootRequirementParams`).
- Types: `MempoolSubmitOffersAction`, `SetterRatifierRatifyRootAction`,
  `MidnightOfferRootSignatureAction`, `MidnightOfferRootSignatureArgs`,
  `MidnightOfferRootSignature`, `MidnightOfferRootRequirement`, `MidnightActionSignatures`.
- Helpers and errors: `isMidnightOfferRootSignature`, the `midnightOfferRoot` slot of
  `selectRequirementSignatures`, `MissingMidnightOfferRootSignatureError`,
  `MidnightOfferRootMismatchError`, `MidnightOfferRootOwnerMismatchError`,
  `MidnightOfferRootRatifierMismatchError`, `MidnightOfferRootOfferCountMismatchError`,
  `UnpreparedMidnightOfferRootSignatureError`, `UnknownMidnightRatifierError`.

- `getMidnightAuthorizationRequirement` and `midnightSetIsAuthorized` no longer accept the
  Ecrecover or Setter ratifier as a target; MidnightBundlesV2 authorizes the V1 ratifier itself.
- `RequirementSignatureKind` no longer includes `"midnightOfferRootSignature"`.

There is no replacement for `UnknownMidnightRatifierError`: the `MidnightMakerTreeInput` type
makes it unreachable. The pure `midnightCancelAndMake` builder accepts only the chain's registered
`priceRatifierV1` or `rateRatifierV1` and throws `UnsupportedMidnightAuthorizationTargetError`
otherwise; entity methods derive the registered ratifier from the tree type.

The Ecrecover and Setter protocol utilities in `@morpho-org/midnight-sdk` are unchanged.

## Single-group cancellation

```ts
// v6
midnight.cancelOffer({ group, accountAddress });

// v7
midnight.cancelOffers({
  accountAddress,
  cancellations: [{ group, maxConsumed: maxUint128 }],
  deadline,
});
```

v6 `cancelOffer` called `Midnight.setConsumed` directly and returned no requirements. v7 `cancelOffers`
goes through MidnightBundlesV2, so call `getRequirements()` first: it returns the maker's Midnight
authorization of `MidnightBundlesV2` when it is missing. The bundle also needs a `deadline`, and
`maxConsumed` only caps how much of the group may already be consumed when the cancellation runs.

Send the transaction from `accountAddress`. v6 reverted unless the sender was the maker or an
account the maker authorized on Midnight. v7 does not: MidnightBundlesV2 cancels the groups of
whichever account sends the transaction, so a transaction from another account that has also
authorized MidnightBundlesV2 succeeds and leaves the maker's offers fillable. `accountAddress` is
only used to check the maker's authorization.

Removed: `cancelOffer`, `midnightCancelOffer`, `MidnightCancelOfferParams`, `MidnightCancelOfferAction` and
`MidnightAmountExceedsMaxOfferCapError`.

## Deployment

MidnightBundlesV2 is pinned on Ethereum, Base, Arc, and Robinhood.
