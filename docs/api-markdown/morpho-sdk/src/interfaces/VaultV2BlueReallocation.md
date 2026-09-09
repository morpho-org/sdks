[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / VaultV2BlueReallocation

# Interface: VaultV2BlueReallocation

Defined in: [packages/morpho-sdk/src/types/sharedLiquidity.ts:148](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/sharedLiquidity.ts#L148)

One Blue Public Allocator contract call performed before a Blue action.

The target market parameters are derived from the enclosing Blue action.

## Properties

### assets

> `readonly` **assets**: `bigint`

Defined in: [packages/morpho-sdk/src/types/sharedLiquidity.ts:156](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/sharedLiquidity.ts#L156)

Asset amount, which must fit in `uint128`.

***

### from

> `readonly` **from**: [`VaultV2BlueReallocationSource`](../type-aliases/VaultV2BlueReallocationSource.md)

Defined in: [packages/morpho-sdk/src/types/sharedLiquidity.ts:152](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/sharedLiquidity.ts#L152)

Liquidity source.

***

### penalty

> `readonly` **penalty**: `bigint`

Defined in: [packages/morpho-sdk/src/types/sharedLiquidity.ts:158](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/sharedLiquidity.ts#L158)

Vault-configured WAD-scaled penalty rate passed to the allocator.

***

### to

> `readonly` **to**: `object`

Defined in: [packages/morpho-sdk/src/types/sharedLiquidity.ts:154](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/sharedLiquidity.ts#L154)

Target Vault V2 adapter; the target market comes from the enclosing action.

#### adapter

> `readonly` **adapter**: `` `0x${string}` ``

***

### vault

> `readonly` **vault**: `` `0x${string}` ``

Defined in: [packages/morpho-sdk/src/types/sharedLiquidity.ts:150](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/sharedLiquidity.ts#L150)

Vault whose liquidity is moved.
