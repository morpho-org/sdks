[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / BlueReallocationPlan

# Type Alias: BlueReallocationPlan

> **BlueReallocationPlan** = `Iterable`\<[`VaultV1Reallocation`](../interfaces/VaultV1Reallocation.md)\> \| `Iterable`\<[`VaultV2BlueReallocation`](../interfaces/VaultV2BlueReallocation.md)\>

Defined in: [packages/morpho-sdk/src/types/sharedLiquidity.ts:167](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/sharedLiquidity.ts#L167)

A homogeneous Blue action plan containing only Vault V1 or only Vault V2 reallocations.

Vault V1 members are deprecated for high-level Blue writes and will stop being accepted in the
next major. Use Vault V2 members for new high-level integrations.
