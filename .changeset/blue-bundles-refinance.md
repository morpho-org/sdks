---
"@morpho-org/morpho-sdk": major
---

Route the established Blue refinance flow through BlueBundlesV1 as a full compatible-position
migration. Replace partial migration inputs while preserving the method and builder names.
`userAddress` must be the account that signs the Morpho authorization and sends the transaction:
the migration operates on the `msg.sender` position, so on-behalf refinance is no longer supported.
The route rejects a reallocation plan whose rounded aggregate penalty exceeds the migrated source
debt (`InputExceedsMaxError`), matching the borrow and withdraw BlueBundlesV1 caps. The v5
partial-migration error classes (`BorrowAmountAndSharesExclusiveError`,
`RefinanceExceedsCollateralError`, `RefinanceExceedsBorrowSharesError`,
`RefinanceExceedsBorrowAssetsError`, `RefinanceSharesMissingBorrowAssetsError`) are deprecated rather
than removed and stay exported through v6 for pattern-matching consumers.
