[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / AssetsOrSharesArgs

# Type Alias: AssetsOrSharesArgs

> **AssetsOrSharesArgs** = \{ `assets`: `bigint`; \} \| \{ `shares`: `bigint`; \}

Defined in: [packages/morpho-sdk/src/types/action.ts:295](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L295)

Enforces that exactly one of `assets` / `shares` is provided.

- `assets`: operate on an exact asset amount.
- `shares`: operate on an exact share count (typical for full position closes,
  immune to interest accrual between tx construction and execution).

Used by withdraw (asserts on supply side). Repay uses [RepayAmountArgs](RepayAmountArgs.md),
which additionally supports native wrapping.
