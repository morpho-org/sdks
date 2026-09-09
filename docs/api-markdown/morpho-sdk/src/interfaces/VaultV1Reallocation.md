[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / VaultV1Reallocation

# ~~Interface: VaultV1Reallocation~~

Defined in: [packages/morpho-sdk/src/types/sharedLiquidity.ts:120](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/sharedLiquidity.ts#L120)

A computed reallocation for a single vault.

Maps 1:1 to a `PublicAllocator.reallocateTo()` call.
Withdraws from source markets and supplies to the target market.

## Deprecated

Vault V1 shared-liquidity support will be removed in the next major. Use
[VaultV2BlueReallocation](VaultV2BlueReallocation.md).

## Properties

### ~~fee~~

> `readonly` **fee**: `bigint`

Defined in: [packages/morpho-sdk/src/types/sharedLiquidity.ts:123](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/sharedLiquidity.ts#L123)

Fee in native token (ETH) paid to the PublicAllocator for this vault.

***

### ~~vault~~

> `readonly` **vault**: `` `0x${string}` ``

Defined in: [packages/morpho-sdk/src/types/sharedLiquidity.ts:121](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/sharedLiquidity.ts#L121)

***

### ~~withdrawals~~

> `readonly` **withdrawals**: readonly [`ReallocationWithdrawal`](ReallocationWithdrawal.md)[]

Defined in: [packages/morpho-sdk/src/types/sharedLiquidity.ts:125](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/sharedLiquidity.ts#L125)

Source markets to withdraw from before supplying to the target market.
