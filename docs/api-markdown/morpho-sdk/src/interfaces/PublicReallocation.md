[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / PublicReallocation

# ~~Interface: PublicReallocation~~

Defined in: [packages/morpho-sdk/src/types/sharedLiquidity.ts:86](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/sharedLiquidity.ts#L86)

A computed source-market withdrawal before it is grouped by vault.

## Deprecated

Vault V1 shared-liquidity planning will be removed in the next major. Use
[VaultV2BlueReallocation](VaultV2BlueReallocation.md).

## Properties

### ~~assets~~

> `readonly` **assets**: `bigint`

Defined in: [packages/morpho-sdk/src/types/sharedLiquidity.ts:94](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/sharedLiquidity.ts#L94)

Assets to withdraw from the source market.

***

### ~~id~~

> `readonly` **id**: [`MarketId`](../../../blue-sdk/src/type-aliases/MarketId.md)

Defined in: [packages/morpho-sdk/src/types/sharedLiquidity.ts:88](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/sharedLiquidity.ts#L88)

Source market id to withdraw from.

***

### ~~vault~~

> `readonly` **vault**: `` `0x${string}` ``

Defined in: [packages/morpho-sdk/src/types/sharedLiquidity.ts:91](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/sharedLiquidity.ts#L91)

Vault that can perform the public allocator reallocation.
