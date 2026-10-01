---
"@morpho-org/morpho-sdk": minor
---

The `midnightSupplyCollateralTakeBorrow` and `midnightRepayWithdrawCollateral` action builders also accept `MidnightSupplyCollateralListTakeBorrowParams` / `MidnightRepayWithdrawCollateralListParams`, which take a `collateralSupplies` / `collateralWithdrawals` list of `{ collateralIndex, assets }` entries (`MidnightCollateralAmount`). The existing params interfaces are unchanged. Entries are encoded in caller order; a repeated index throws `DuplicateMidnightCollateralIndexError`, an empty supply list throws `EmptyMidnightCollateralAmountsError`, an empty withdrawal list withdraws nothing, and mixing the list with the single-collateral fields throws `ConflictingMidnightCollateralInputError`. `MidnightSupplyCollateralTakeBorrowAction` args gain `collateralAmounts`, the supplied amount per index.
