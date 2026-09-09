[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk/src](../README.md) / PeripheralBalance

# Interface: PeripheralBalance

Defined in: [packages/blue-sdk/src/holding/AssetBalances.ts:21](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/holding/AssetBalances.ts#L21)

Represents the balance of a requested token and the balance quoted in the corresponding source token:
```{
 type: "staked-wrapped",
 srcToken: ETH,
 srcAmount: 1 ETH,
 dstAmount: 1.2 wstETH
}```

## Properties

### dstAmount

> **dstAmount**: `bigint`

Defined in: [packages/blue-sdk/src/holding/AssetBalances.ts:37](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/holding/AssetBalances.ts#L37)

The corresponding amount of token held after conversion of the whole balance `srcAmount`.

***

### srcAmount

> **srcAmount**: `bigint`

Defined in: [packages/blue-sdk/src/holding/AssetBalances.ts:33](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/holding/AssetBalances.ts#L33)

The source amount of source token held.

***

### srcToken

> **srcToken**: [`Token`](../classes/Token.md)

Defined in: [packages/blue-sdk/src/holding/AssetBalances.ts:29](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/holding/AssetBalances.ts#L29)

The source token held corresponding to the type of balance conversion.

***

### type

> **type**: [`PeripheralBalanceType`](../type-aliases/PeripheralBalanceType.md)

Defined in: [packages/blue-sdk/src/holding/AssetBalances.ts:25](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/holding/AssetBalances.ts#L25)

The type of balance conversion.
