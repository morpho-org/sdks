[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / ReallocationWithdrawal

# ~~Interface: ReallocationWithdrawal~~

Defined in: [packages/morpho-sdk/src/types/sharedLiquidity.ts:103](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/sharedLiquidity.ts#L103)

A single withdrawal from a source market within a vault reallocation.

## Deprecated

Vault V1 shared-liquidity support will be removed in the next major. Use
[VaultV2BlueReallocation](VaultV2BlueReallocation.md).

## Properties

### ~~amount~~

> `readonly` **amount**: `bigint`

Defined in: [packages/morpho-sdk/src/types/sharedLiquidity.ts:108](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/sharedLiquidity.ts#L108)

Asset amount to withdraw from the source market.

***

### ~~marketParams~~

> `readonly` **marketParams**: [`MarketParams`](../../../blue-sdk/src/classes/MarketParams.md)

Defined in: [packages/morpho-sdk/src/types/sharedLiquidity.ts:105](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/sharedLiquidity.ts#L105)

Source market parameters to pass to the public allocator.
