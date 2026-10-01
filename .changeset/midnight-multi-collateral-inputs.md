---
"@morpho-org/morpho-sdk": minor
---

Midnight entity methods `supplyCollateralTakeBorrow`, `supplyCollateralMakeBorrow` and `repayWithdrawCollateral` accept a `collateralSupplies` / `collateralWithdrawals` list of `{ collateralIndex, assets }` entries (maker entries also take `reservedAssets`, exported as `MidnightReservedCollateralAmount`) as an alternative to the single-collateral inputs, which keep working unchanged. `getRequirements()` returns one approval per supplied token, to `MidnightBundles` for the bundle flows and to `Midnight` for the maker flow, which also returns one collateral supply per entry. The affected params are now union type aliases, so extend them with `&` instead of `interface ... extends`.
