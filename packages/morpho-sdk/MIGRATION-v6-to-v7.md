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
