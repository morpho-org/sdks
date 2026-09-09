[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / ReallocationComputeOptions

# ~~Interface: ReallocationComputeOptions~~

Defined in: [packages/morpho-sdk/src/types/sharedLiquidity.ts:188](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/sharedLiquidity.ts#L188)

Options for computing vault reallocations via the public allocator.

Extends [PublicAllocatorOptions](PublicAllocatorOptions.md) with supply-side utilization targets
that determine when reallocation is triggered.

## Deprecated

Vault V1 shared-liquidity planning will be removed in the next major. Use
[VaultV2BluePublicAllocatorOptions](VaultV2BluePublicAllocatorOptions.md).

## Extends

- [`PublicAllocatorOptions`](PublicAllocatorOptions.md)

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

#### Inherited from

[`PublicAllocatorOptions`](PublicAllocatorOptions.md).[`defaultMaxWithdrawalUtilization`](PublicAllocatorOptions.md#defaultmaxwithdrawalutilization)

***

### ~~defaultSupplyTargetUtilization?~~

> `readonly` `optional` **defaultSupplyTargetUtilization?**: `bigint`

Defined in: [packages/morpho-sdk/src/types/sharedLiquidity.ts:211](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/sharedLiquidity.ts#L211)

The default target utilization above which the shared liquidity algorithm
is triggered (scaled by WAD).

#### Default

```ts
90% (900000000000000000n)
```

#### Deprecated

The supply-target trigger is fixed at 90%
([DEFAULT\_SUPPLY\_TARGET\_UTILIZATION](../variables/DEFAULT_SUPPLY_TARGET_UTILIZATION.md)) and will stop being configurable
in the next major. Overrides are still honored for now.

***

### ~~enabled?~~

> `readonly` `optional` **enabled?**: `boolean`

Defined in: [packages/morpho-sdk/src/types/sharedLiquidity.ts:12](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/sharedLiquidity.ts#L12)

Whether public allocator reallocation discovery is enabled.

#### Inherited from

[`PublicAllocatorOptions`](PublicAllocatorOptions.md).[`enabled`](PublicAllocatorOptions.md#enabled)

***

### ~~maxWithdrawalUtilization?~~

> `readonly` `optional` **maxWithdrawalUtilization?**: `Readonly`\<`Record`\<[`MarketId`](../../../blue-sdk/src/type-aliases/MarketId.md), `bigint` \| `undefined`\>\>

Defined in: [packages/morpho-sdk/src/types/sharedLiquidity.ts:34](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/sharedLiquidity.ts#L34)

The maximum utilization each source market may reach when withdrawing
shared liquidity, scaled by WAD.

#### Deprecated

Per-market source ceilings will be removed in the next major.
Use `defaultMaxWithdrawalUtilization` to configure one ceiling for every source.

#### Inherited from

[`PublicAllocatorOptions`](PublicAllocatorOptions.md).[`maxWithdrawalUtilization`](PublicAllocatorOptions.md#maxwithdrawalutilization)

***

### ~~reallocatableVaults?~~

> `readonly` `optional` **reallocatableVaults?**: `Iterable`\<`` `0x${string}` ``, `any`, `any`\>

Defined in: [packages/morpho-sdk/src/types/sharedLiquidity.ts:25](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/sharedLiquidity.ts#L25)

Vaults to consider for reallocation. They must have enabled the PublicAllocator.
Arrays, readonly arrays, sets, and other iterables are accepted.
Defaults to all vaults present in the reallocation data.

#### Inherited from

[`PublicAllocatorOptions`](PublicAllocatorOptions.md).[`reallocatableVaults`](PublicAllocatorOptions.md#reallocatablevaults)

***

### ~~supplyTargetUtilization?~~

> `readonly` `optional` **supplyTargetUtilization?**: `Readonly`\<`Record`\<[`MarketId`](../../../blue-sdk/src/type-aliases/MarketId.md), `bigint` \| `undefined`\>\>

Defined in: [packages/morpho-sdk/src/types/sharedLiquidity.ts:198](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/sharedLiquidity.ts#L198)

Per-market target utilization above which the shared liquidity algorithm
is triggered (scaled by WAD). Overrides `defaultSupplyTargetUtilization`
for the specified market.

#### Deprecated

The supply-target trigger is fixed at 90%
([DEFAULT\_SUPPLY\_TARGET\_UTILIZATION](../variables/DEFAULT_SUPPLY_TARGET_UTILIZATION.md)) and will stop being configurable
in the next major. Per-market overrides are still honored for now.

***

### ~~timestamp?~~

> `readonly` `optional` **timestamp?**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/morpho-sdk/src/types/sharedLiquidity.ts:18](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/sharedLiquidity.ts#L18)

Timestamp at which market interest and public allocator pending caps are evaluated.
Defaults to the target market's last update timestamp.

#### Inherited from

[`PublicAllocatorOptions`](PublicAllocatorOptions.md).[`timestamp`](PublicAllocatorOptions.md#timestamp)
