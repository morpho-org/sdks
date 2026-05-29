---
"@morpho-org/morpho-sdk": minor
---

Add `MarketV1.refinance()` to migrate a position (collateral + debt) atomically from one Morpho Blue market to another sharing the same loan and collateral tokens. Implemented as a flash-collateral bundle via `onMorphoSupplyCollateral`: GA1 deposits on the target, borrows inside the callback, repays the source, then withdraws the source collateral to settle the deferred transfer — no user-side prefunding required. Shares mode is immune to mid-tx accrual; collat-only and partial migrations are supported. Adds nine typed errors (`NegativeBorrowSharesError`, `BorrowAmountAndSharesExclusiveError`, `NegativeMaxRepaySharePriceError`, `RefinanceSameMarketError`, `RefinanceTokenMismatchError`, `RefinanceExceedsCollateralError`, `RefinanceExceedsBorrowSharesError`, `RefinanceExceedsBorrowAssetsError`, `RefinanceSharesMissingBorrowAssetsError`) and the `MarketV1RefinanceAction` discriminant.
