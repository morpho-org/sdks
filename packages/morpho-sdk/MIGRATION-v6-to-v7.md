# Migrating `@morpho-org/morpho-sdk` from v6 to v7

Version 7 publishes Midnight maker offers through MidnightBundlesV2 in one transaction. The v6
flow sent a separate root-ratification transaction or root signature, then posted the offers to
MidnightMempool. v7 removes that route instead of keeping it selectable; stay on v6 if you
still need it.

## Maker methods

| v6 | v7 |
| --- | --- |
| `makeLend` | `cancelAndMakeLend` |
| `makeBorrow` | `cancelAndMakeBorrow` |
| `supplyCollateralMakeBorrow` | `supplyCollateralMakeBorrow` (retyped) |

One MidnightBundlesV2 call now cancels the groups you are replacing, optionally supplies borrow
collateral, authorizes the ratifier, activates the new root, and publishes the payload. If any
cancelled group was filled beyond its `maxConsumed` before the transaction lands, the whole call
reverts and nothing is published.

If `collateral` is provided to `cancelAndMakeBorrow`, its `supplies` list must contain at least one
entry. An explicit empty list throws `EmptyMidnightCollateralSuppliesError`; omit `collateral` when
no collateral is supplied. `supplyCollateralMakeBorrow` remains as a thin wrapper around
`cancelAndMakeBorrow` and requires `collateral`.

```ts
// v6
const output = await midnight.makeLend({ accountAddress, offers, loanToken, loanAssets });
const tx = output.buildTx(await signRequirements(await output.getRequirements()));

// v7: repost over previousGroup; pass `cancellations: []` for a fresh publication
const output = await midnight.cancelAndMakeLend({
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

The wrapper returns `CancelAndMakeOutput`, whose transaction action is
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

- Requirements approve the loan token (`takeLend`: `assets` or `maxBuyerAssets`) or each collateral
  token (summed per token) to MidnightBundlesV2, and authorize MidnightBundlesV2 on Midnight.
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
  `@morpho-org/morpho-sdk/midnight`. Import it from `@morpho-org/midnight-sdk` if you still need it.
- `RequirementSpenderKey` drops `"midnightBundles"`. `encodeErc20Approval` and
  `getMidnightApprovalRequirements` reject a `midnightBundles` spender, and `encodeErc20Permit` no
  longer signs permits for it (V2 takes no inline permits).
- `midnightSetIsAuthorized` and `getMidnightAuthorizationRequirement` accept only
  `midnightBundlesV2` as the authorized operator. Revoke an existing V1 grant with Midnight's
  `setIsAuthorized(midnightBundles, false, account)` directly.
- `UnsupportedErc20ApprovalSpenderError` no longer takes a `midnightBundles` constructor field.

## repayWithdrawCollateral

`repayWithdrawCollateral` now calls MidnightBundlesV2 for the sender (no `onBehalf`). It repays
debt directly, without taking offers, and can withdraw several collaterals in the same call.

| v6 input | v7 input |
| --- | --- |
| `repayAssets` | `repay: { type: "assets", assets }` (repays exactly `assets`; `0n` for withdraw-only) or `repay: { type: "full", maxBuyerAssets }` (repays the whole debt at execution time, pulling at most the finite `maxBuyerAssets`) |
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

- Requirements approve the pulled loan assets (`assets`, or `maxBuyerAssets` on a full repay) to
  MidnightBundlesV2 (skipped when `0n`) and authorize MidnightBundlesV2 on Midnight. Unused assets
  are refunded. A full repay rejects `maxBuyerAssets` of `0n` or `maxUint256`.
- `MidnightRepayWithdrawCollateralAction.args` exposes `repay` and the `collateralWithdrawals`
  list, and drops `repayAssets` and `onBehalf`.
- The `midnightRepayWithdrawCollateral` builder takes the same `repay` and `collateralWithdrawals`
  plus a required `collateralReceiver`; it drops `repayAssets`, `withdrawCollateralAssets`,
  `collateralIndex` and `onBehalf`. Like the other V2 builders, it throws `UnknownAddressError`
  unless `midnightBundlesV2` is registered for the chain (see `registerCustomAddresses`).

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
  collateral approvals to MidnightBundlesV2. It no longer returns a root signature or a
  SetterRatifier root transaction, so `buildTx()` takes no signatures.
- Replacement offers need fresh groups. A group cannot be both published and cancelled
  (`MidnightReplacementGroupCancelledError`).

## Renamed and changed types

| v6 | v7 |
| --- | --- |
| `MidnightMakeOffersParams` | `MidnightCancelAndMakeOffersParams` |
| `MidnightMakeLendParams` | `MidnightCancelAndMakeLendParams` |
| — | `MidnightCancelAndMakeBorrowParams` (optional `collateral`) |
| `MidnightSupplyCollateralMakeBorrowParams` | `MidnightSupplyCollateralMakeBorrowParams` (required `collateral`) |
| `MidnightMakeOffersOutput` | `MidnightCancelAndMakeOutput` |
| — | `MidnightMakeBorrowCollateral` |
| — | `MidnightOfferPublication` and `MidnightCancelAndMakeParams` |

- `MidnightCancelAndMakeBorrowParams` keeps `collateral` optional and uses
  `MidnightMakeBorrowCollateral` for its `market` and `supplies`. The wrapper's
  `MidnightSupplyCollateralMakeBorrowParams` makes that same `collateral` required. These nested
  supplies replace the v6 `market`, `collateralAssets`, and `collateralIndex` inputs;
  `reservedCollateralAssets` is removed. The collateral approval now covers only supplied amounts
  and goes to MidnightBundlesV2 instead of Midnight.
- `MidnightCancelAndMakeParams` takes ratifier, root, groups, payload, root signature, and optional
  collateral together under `publication?: MidnightOfferPublication`. Omit `publication` for
  cancel-only calls; this preserves `cancelOffers` behavior.
- `offers` accepts only `MidnightMakerTreeInput` (a PriceRatifierV1 or RateRatifierV1 tree or
  `Tree.create` request) instead of any `TreeInput`.
- `MidnightOfferValidationParams` no longer accepts `ratification`; the ratifier comes from the tree.
- `MidnightOffersData.ratifierType` is `"priceV1" | "rateV1"` instead of `"ecrecover" | "setter"`.
- `MidnightOffersData.setterPayload` is replaced by `payload`, set for every tree.

## Removed exports

- Actions and requirements: `mempoolSubmitOffers`, `setterRatifierRatifyRoot`,
  `getSetterRatifierRatifyRootRequirement`.
- Types: `MempoolSubmitOffersAction`, `SetterRatifierRatifyRootAction`,
  `MidnightOfferRootSignatureAction`, `MidnightOfferRootSignatureArgs`,
  `MidnightOfferRootSignature`, `MidnightOfferRootRequirement`, `MidnightActionSignatures`,
  `MidnightMakeLendParams`, `MidnightMakeOffersParams`, `MidnightMakeOffersOutput`.
- Helpers and errors: `isMidnightOfferRootSignature`, the `midnightOfferRoot` slot of
  `selectRequirementSignatures`, `MissingMidnightOfferRootSignatureError`,
  `MidnightOfferRootMismatchError`, `MidnightOfferRootOwnerMismatchError`,
  `MidnightOfferRootRatifierMismatchError`, `MidnightOfferRootOfferCountMismatchError`,
  `UnpreparedMidnightOfferRootSignatureError`, `UnknownMidnightRatifierError`.

- `getMidnightAuthorizationRequirement` and `midnightSetIsAuthorized` no longer accept the
  Ecrecover or Setter ratifier as a target; MidnightBundlesV2 authorizes the V1 ratifier itself.
- `RequirementSignatureKind` no longer includes `"midnightOfferRootSignature"`.

There is no replacement for `UnknownMidnightRatifierError`: the pure `midnightCancelAndMake`
builder accepts any ratifier address, and entity methods derive the registered ratifier from the
tree type.

The Ecrecover and Setter protocol utilities in `@morpho-org/midnight-sdk` are unchanged.

## Deployment

No chain registers `midnightBundlesV2` yet. Register a deployment with `registerCustomAddresses`
before calling the maker or taker methods.
