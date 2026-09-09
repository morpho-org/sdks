[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / VaultV2BluePublicAllocatorOptions

# Interface: VaultV2BluePublicAllocatorOptions

Defined in: [packages/morpho-sdk/src/types/sharedLiquidity.ts:48](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/sharedLiquidity.ts#L48)

Options controlling Vault V2 BluePublicAllocator reallocation discovery.

## Properties

### enabled?

> `readonly` `optional` **enabled?**: `boolean`

Defined in: [packages/morpho-sdk/src/types/sharedLiquidity.ts:50](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/sharedLiquidity.ts#L50)

Whether Vault V2 public allocator discovery is enabled.

***

### maxPenalty?

> `readonly` `optional` **maxPenalty?**: `bigint`

Defined in: [packages/morpho-sdk/src/types/sharedLiquidity.ts:77](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/sharedLiquidity.ts#L77)

Maximum proportional vault-asset penalty accepted for each
BluePublicAllocator call, scaled by WAD. Vaults with a higher configured
penalty are ignored. Must not exceed WAD (100%).

#### Default

```ts
0n
```

***

### maxWithdrawalUtilization?

> `readonly` `optional` **maxWithdrawalUtilization?**: `bigint`

Defined in: [packages/morpho-sdk/src/types/sharedLiquidity.ts:68](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/sharedLiquidity.ts#L68)

Maximum utilization source markets may reach during friendly discovery,
scaled by WAD. The amount-aware planner falls back to 100% only when the
friendly phase cannot cover the operation's absolute shortfall.

#### Default

```ts
90% (900000000000000000n)
```

***

### reallocatableVaults?

> `readonly` `optional` **reallocatableVaults?**: `Iterable`\<`` `0x${string}` ``, `any`, `any`\>

Defined in: [packages/morpho-sdk/src/types/sharedLiquidity.ts:59](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/sharedLiquidity.ts#L59)

Vault V2 addresses to consider. Arrays, readonly arrays, sets, and other
iterables are accepted. Defaults to every vault in the reallocation data.

***

### timestamp?

> `readonly` `optional` **timestamp?**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/morpho-sdk/src/types/sharedLiquidity.ts:53](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/sharedLiquidity.ts#L53)

Timestamp at which market and Vault V2 interest is evaluated.
