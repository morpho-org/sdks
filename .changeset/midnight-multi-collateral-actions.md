---
"@morpho-org/morpho-sdk": minor
---

The `midnightSupplyCollateralTakeBorrow` and `midnightRepayWithdrawCollateral` action builders accept a `collateralSupplies` / `collateralWithdrawals` list of `{ collateralIndex, assets }` entries (`MidnightCollateralAmount`) as an alternative to the single `collateralAssets` / `withdrawCollateralAssets` + `collateralIndex` inputs, which keep working unchanged. Entries are encoded in caller order; a repeated index throws `DuplicateMidnightCollateralIndexError`, an empty supply list throws `EmptyMidnightCollateralAmountsError`, and an empty withdrawal list withdraws nothing. Both params types are now union type aliases, so extend them with `&` instead of `interface ... extends`. A negative supply `collateralIndex` now throws `NegativeInputError` instead of `UnknownCollateralIndexError`.
