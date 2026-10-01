---
"@morpho-org/morpho-sdk": minor
---

Midnight entity methods `supplyCollateralTakeBorrow`, `supplyCollateralMakeBorrow` and `repayWithdrawCollateral` also accept new list params (`MidnightSupplyCollateralListTakeBorrowParams`, `MidnightSupplyCollateralListMakeBorrowParams`, `MidnightRepayWithdrawCollateralListParams`) with a `collateralSupplies` / `collateralWithdrawals` list of `{ collateralIndex, assets }` entries. Maker entries also take `reservedAssets` (`MidnightReservedCollateralAmount`). The existing params interfaces are unchanged. `getRequirements()` returns one approval per supplied token, to `MidnightBundles` for the bundle flows and to `Midnight` for the maker flow, which also returns one collateral supply per entry.
