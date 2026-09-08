---
"@morpho-org/morpho-sdk": major
---

Route the established Blue refinance flow through BlueBundlesV1 as a full compatible-position
migration. Replace partial migration inputs while preserving the method and builder names.
`userAddress` identifies the intended transaction sender and, when used, Morpho authorization
signer. The migration operates on the `msg.sender` position, so on-behalf refinance is no longer
supported. Builders cannot enforce this alignment because `userAddress` is not encoded in calldata.
The v5 partial-migration error classes (`BorrowAmountAndSharesExclusiveError`,
`RefinanceExceedsCollateralError`, `RefinanceExceedsBorrowSharesError`,
`RefinanceExceedsBorrowAssetsError`, `RefinanceSharesMissingBorrowAssetsError`) are removed in v6.
These classes shipped without a published deprecation window. Their removal is an intentional,
one-time lifecycle deviation because partial and collateral-only refinance modes no longer exist;
consumers pattern-matching them must remove those branches or stay on v5.
