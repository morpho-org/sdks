[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / RepayAmountArgs

# Type Alias: RepayAmountArgs

> **RepayAmountArgs** = [`DepositAmountArgs`](DepositAmountArgs.md) \| \{ `nativeAmount?`: `bigint`; `shares`: `bigint`; \}

Defined in: [packages/morpho-sdk/src/types/action.ts:309](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L309)

Repay funding sources for the **entity layer** (`MorphoBlue.repay` /
`MorphoBlue.repayWithdrawCollateral`), which computes the loan-token
`transferAmount` itself from live market state.

- **assets mode** ([DepositAmountArgs](DepositAmountArgs.md)): repay an exact asset total of
  `amount` (ERC-20) + `nativeAmount` (wrapped native). Additive — mirrors `blueSupply`.
- **shares mode** (`{ shares }`): repay an exact borrow-share count (full close,
  immune to interest accrual). `nativeAmount` funds part of the transfer.

`nativeAmount` requires the market's loan token to be the chain's wNative.
