# Migrating `@morpho-org/morpho-sdk` from v6 to v7

## Midnight `supplyCollateralMakeBorrow`

`MorphoMidnight.supplyCollateralMakeBorrow` keeps its name but no longer returns a chain of
prerequisite transactions followed by a mempool submission. It returns one
`MidnightBundlesV2.midnightBundlesV2CancelAndMake` transaction that, for `msg.sender`:

1. cancels each listed prior offer group, reverting everything if a group's consumption exceeds its `maxConsumed`;
2. pulls and supplies every collateral transfer;
3. authorizes the tree's ratifier on Midnight and ratifies the root directly;
4. logs the payload to the Midnight mempool.

There is no V1 route or opt-in flag. Stay on v6 to keep the separate-transaction flow.

> **Chain availability.** No chain registers `midnightBundlesV2` yet. Until a verified deployment
> ships, register one with `registerCustomAddresses({ addresses: { [chainId]: { midnightBundlesV2 } } })`;
> otherwise the method throws `UnknownAddressError`.

| v6 | v7 |
| --- | --- |
| `collateralAssets`, optional `collateralIndex` | `collateralSupplies: readonly { collateralIndex, assets }[]`, one entry per collateral index. |
| `reservedCollateralAssets` | Removed. Approvals cover exactly the supplied amounts. |
| `offers: TreeInput` (Ecrecover or Setter tree) | `offers`: a `priceV1` or `rateV1` tree or tree request whose offers use the chain's `priceRatifierV1` / `rateRatifierV1`. Other trees throw `UnsupportedMidnightBundlesV2RatifierError`. |
| — | Optional `cancellations: readonly { group, maxConsumed }[]`. |
| — | Required `deadline` (pass `maxUint256` for no expiry). |
| `validation: OfferValidationParams` | `validation` without `ratification`; the tree route is fixed. |

| v6 output | v7 output |
| --- | --- |
| `MakeOffersOutput` | `SupplyCollateralMakeBorrowOutput` |
| `ratifierType: "ecrecover" \| "setter"` | `ratifierType: "priceV1" \| "rateV1"` |
| Requirements: ERC-20 approval to `Midnight`, `midnightSupplyCollateral`, ratifier authorization, root signature or setter ratification | Requirements: ERC-20 approval per collateral token to `MidnightBundlesV2`, and Midnight authorization of `MidnightBundlesV2` |
| `buildTx(signatures)` → `mempoolSubmitOffers` action | `buildTx()` → `midnightSupplyCollateralMakeBorrow` action targeting `MidnightBundlesV2` |

```ts
// v6
const output = await midnight.supplyCollateralMakeBorrow({
  accountAddress: maker,
  market,
  offers: tree,
  collateralAssets: parseUnits("2", 18),
});
const tx = output.buildTx(signatures);

// v7
const output = await midnight.supplyCollateralMakeBorrow({
  accountAddress: maker,
  market,
  offers: { type: "priceV1", entries: [{ offer: borrowOffer }] },
  collateralSupplies: [{ collateralIndex: 0n, assets: parseUnits("2", 18) }],
  cancellations: [{ group: previousGroup, maxConsumed: 0n }],
  deadline: maxUint256,
});
for (const requirement of await output.getRequirements()) {
  await walletClient.sendTransaction(requirement);
}
const tx = output.buildTx();
```

V2 accepts no inline token permits; use the returned approval requirements. The low-level
`midnightSupplyCollateralMakeBorrow` builder encodes the same call from a precomputed root and payload.
