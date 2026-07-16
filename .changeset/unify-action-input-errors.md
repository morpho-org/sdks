---
"@morpho-org/morpho-sdk": minor
---

Consolidate Vault, Blue, and Midnight scalar input validation into two protocol-agnostic errors: `NegativeInputError` for inputs that must be non-negative and `NonPositiveInputError` for inputs that must be positive. Both errors expose the invalid `field` and `value` as readonly properties.

This replaces the operation-specific scalar-bound error implementations with deprecated aliases to the two canonical classes, preserving imports and `instanceof` checks during the deprecation window:

- `NonPositiveAssetAmountError`, `NonPositiveSharesAmountError`, `NonPositiveMaxSharePriceError`, `ZeroDepositAmountError`, `NonPositiveBorrowAmountError`, `ZeroCollateralAmountError`, `NonPositiveReallocationAmountError`, `NonPositiveRepayAmountError`, `NonPositiveRepayMaxSharePriceError`, `NonPositiveWithdrawCollateralAmountError`, `ZeroSupplyAmountError`, and `NonPositiveWithdrawAmountError` alias `NonPositiveInputError`.
- `NegativeSlippageToleranceError`, `NegativeNativeAmountError`, `NegativeReallocationFeeError`, `NonPositiveMinBorrowSharePriceError`, `NegativeSupplyAmountError`, `NegativeSupplyMaxSharePriceError`, `NegativeWithdrawMinSharePriceError`, `NegativeMinSharePriceError`, `NegativeBorrowSharesError`, and `NegativeMaxRepaySharePriceError` alias `NegativeInputError`.

The previously deprecated `NonPositiveTransferAmountError` and `NativeAmountExceedsTransferAmountError` exports are removed. The unreleased Midnight-specific scalar errors are superseded directly by the canonical errors.

Compatibility warning (acknowledged): this minor release intentionally changes the constructor signatures, constructor identity, and `name` property observed through the deprecated aliases. Negative values previously matched by a legacy `NonPositive*Error` may now match `NegativeInputError` instead. It also removes the two previously deprecated exports named above. These compatibility risks are explicitly accepted for this release despite their normally breaking nature.

Consumers should replace handlers for these classes with the shared input error matching the documented constraint of each field.

State-independent validation is now repeated at both public boundaries: Blue entities and pure actions reject the same malformed scalar modes and reallocations, while Midnight entities and pure actions reject the same malformed amounts, market chains, collateral indexes, and empty offer submissions.

Domain-specific errors for conflicting modes, mismatched data, exceeded balances, unsupported native assets, and unsafe positions remain unchanged.
