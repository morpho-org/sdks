---
"@morpho-org/morpho-sdk": major
---

Consolidate Vault, Blue, and Midnight scalar input validation into two protocol-agnostic errors: `NegativeInputError` for inputs that must be non-negative and `NonPositiveInputError` for inputs that must be positive. Both errors expose the invalid `field` and `value` as readonly properties.

This removes the operation-specific scalar-bound error classes:

- `NonPositiveAssetAmountError`, `NonPositiveSharesAmountError`, `NonPositiveMaxSharePriceError`, `ZeroDepositAmountError`, `NonPositiveBorrowAmountError`, `ZeroCollateralAmountError`, `NonPositiveReallocationAmountError`, `NonPositiveTransferAmountError`, `NonPositiveRepayAmountError`, `NonPositiveRepayMaxSharePriceError`, `NonPositiveWithdrawCollateralAmountError`, `NonPositiveMidnightAmountError`, `ZeroSupplyAmountError`, and `NonPositiveWithdrawAmountError`.
- `NegativeSlippageToleranceError`, `NegativeNativeAmountError`, `NegativeReallocationFeeError`, `NegativeMidnightAmountError`, `NonPositiveMinBorrowSharePriceError`, `NegativeSupplyAmountError`, `NegativeSupplyMaxSharePriceError`, `NegativeWithdrawMinSharePriceError`, `NegativeMinSharePriceError`, `NegativeBorrowSharesError`, and `NegativeMaxRepaySharePriceError`.

Consumers should replace handlers for these classes with the shared input error matching the documented constraint of each field.

Domain-specific errors for conflicting modes, mismatched data, exceeded balances, unsupported native assets, and unsafe positions remain unchanged.
