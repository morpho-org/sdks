[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / DepositAmountArgs

# Type Alias: DepositAmountArgs

> **DepositAmountArgs** = \{ `amount`: `bigint`; `nativeAmount?`: `bigint`; \} \| \{ `amount?`: `bigint`; `nativeAmount`: `bigint`; \}

Defined in: [packages/morpho-sdk/src/types/action.ts:533](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L533)

Enforces that at least one deposit amount source is provided.

- `amount` alone: standard ERC20 deposit.
- `nativeAmount` alone: pure native-wrap deposit (vault asset must be wNative).
- Both: mixed deposit (ERC20 transfer + native wrap).
