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
| `supplyCollateralMakeBorrow` | `cancelAndMakeBorrow` with `collateral` |

One MidnightBundlesV2 call now cancels the groups you are replacing, optionally supplies borrow
collateral, authorizes the ratifier, activates the new root, and publishes the payload. If any
cancelled group was filled beyond its `maxConsumed` before the transaction lands, the whole call
reverts and nothing is published.

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
await midnight.cancelAndMakeBorrow({
  accountAddress,
  offers,
  collateral: { market, supplies: [{ collateralIndex: 0n, assets: collateralAssets }] },
  deadline,
});
```

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
| `MidnightSupplyCollateralMakeBorrowParams` | `MidnightCancelAndMakeBorrowParams` (optional `collateral`) |
| `MidnightMakeOffersOutput` | `MidnightCancelAndMakeOutput` |

- `MidnightCancelAndMakeBorrowParams` moves `market`, `collateralIndex` and `collateralAssets` into
  `collateral: { market, supplies: [{ collateralIndex, assets }] }`. `reservedCollateralAssets` is
  removed: the collateral approval now covers only the supplied amounts and goes to
  MidnightBundlesV2 instead of Midnight.
- `offers` accepts only `MidnightMakerTreeInput` (a PriceRatifierV1 or RateRatifierV1 tree or
  `Tree.create` request) instead of any `TreeInput`.
- `MidnightOfferValidationParams` no longer accepts `ratification`; the ratifier comes from the tree.
- `MidnightOffersData.ratifierType` is `"priceV1" | "rateV1"` instead of `"ecrecover" | "setter"`.
- `MidnightOffersData.setterPayload` is replaced by `payload`, set for every tree.
- `UnknownMidnightRatifierError` takes `{ ratifier, priceRatifierV1, rateRatifierV1 }` instead of
  `{ ratifier, ecrecoverRatifier, setterRatifier }`.

## Removed exports

- Actions and requirements: `mempoolSubmitOffers`, `setterRatifierRatifyRoot`,
  `getSetterRatifierRatifyRootRequirement`.
- Types: `MempoolSubmitOffersAction`, `SetterRatifierRatifyRootAction`,
  `MidnightOfferRootSignatureAction`, `MidnightOfferRootSignatureArgs`,
  `MidnightOfferRootSignature`, `MidnightOfferRootRequirement`, `MidnightActionSignatures`,
  `MidnightMakeLendParams`, `MidnightMakeOffersParams`, `MidnightMakeOffersOutput`,
  `MidnightSupplyCollateralMakeBorrowParams`.
- Helpers and errors: `isMidnightOfferRootSignature`, the `midnightOfferRoot` slot of
  `selectRequirementSignatures`, `MissingMidnightOfferRootSignatureError`,
  `MidnightOfferRootMismatchError`, `MidnightOfferRootOwnerMismatchError`,
  `MidnightOfferRootRatifierMismatchError`, `MidnightOfferRootOfferCountMismatchError`,
  `UnpreparedMidnightOfferRootSignatureError`.
- `getMidnightAuthorizationRequirement` no longer accepts the Ecrecover or Setter ratifier as a
  target; MidnightBundlesV2 authorizes the V1 ratifier itself.

The Ecrecover and Setter protocol utilities in `@morpho-org/midnight-sdk` are unchanged.

## Deployment

No chain registers `midnightBundlesV2` yet. Register a deployment with `registerCustomAddresses`
before calling the maker methods.
