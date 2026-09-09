[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / PublicAllocatorOptions

# ~~Interface: PublicAllocatorOptions~~

Defined in: [packages/morpho-sdk/src/types/sharedLiquidity.ts:10](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/sharedLiquidity.ts#L10)

Options controlling public allocator withdrawal discovery.

## Deprecated

Vault V1 shared-liquidity planning will be removed in the next major. Use
[VaultV2BluePublicAllocatorOptions](VaultV2BluePublicAllocatorOptions.md).

## Extended by

- [`ReallocationComputeOptions`](ReallocationComputeOptions.md)

## Properties

### ~~defaultMaxWithdrawalUtilization?~~

> `readonly` `optional` **defaultMaxWithdrawalUtilization?**: `bigint`

Defined in: [packages/morpho-sdk/src/types/sharedLiquidity.ts:44](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/sharedLiquidity.ts#L44)

The default maximum utilization source markets may reach when withdrawing
shared liquidity, scaled by WAD.

#### Default

```ts
90% (900000000000000000n)
```

***

### ~~enabled?~~

> `readonly` `optional` **enabled?**: `boolean`

Defined in: [packages/morpho-sdk/src/types/sharedLiquidity.ts:12](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/sharedLiquidity.ts#L12)

Whether public allocator reallocation discovery is enabled.

***

### ~~maxWithdrawalUtilization?~~

> `readonly` `optional` **maxWithdrawalUtilization?**: `Readonly`\<`Record`\<[`MarketId`](../../../blue-sdk/src/type-aliases/MarketId.md), `bigint` \| `undefined`\>\>

Defined in: [packages/morpho-sdk/src/types/sharedLiquidity.ts:34](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/sharedLiquidity.ts#L34)

The maximum utilization each source market may reach when withdrawing
shared liquidity, scaled by WAD.

#### Deprecated

Per-market source ceilings will be removed in the next major.
Use `defaultMaxWithdrawalUtilization` to configure one ceiling for every source.

***

### ~~reallocatableVaults?~~

> `readonly` `optional` **reallocatableVaults?**: `Iterable`\<`` `0x${string}` ``, `any`, `any`\>

Defined in: [packages/morpho-sdk/src/types/sharedLiquidity.ts:25](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/sharedLiquidity.ts#L25)

Vaults to consider for reallocation. They must have enabled the PublicAllocator.
Arrays, readonly arrays, sets, and other iterables are accepted.
Defaults to all vaults present in the reallocation data.

***

### ~~timestamp?~~

> `readonly` `optional` **timestamp?**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/morpho-sdk/src/types/sharedLiquidity.ts:18](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/sharedLiquidity.ts#L18)

Timestamp at which market interest and public allocator pending caps are evaluated.
Defaults to the target market's last update timestamp.
