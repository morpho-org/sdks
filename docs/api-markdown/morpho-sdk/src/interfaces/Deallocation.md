[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / Deallocation

# Interface: Deallocation

Defined in: [packages/morpho-sdk/src/types/deallocation.ts:12](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/deallocation.ts#L12)

A single deallocation entry for a `forceDeallocate` call.

- When `marketParams` is provided, the adapter is treated as a Morpho Market V1 adapter
  and `data` is ABI-encoded from the given `MarketParams`.
- When `marketParams` is omitted, empty bytes are passed as `data` (suitable for adapters
  such as Vault V1 that do not require market identification).

## Properties

### adapter

> `readonly` **adapter**: `` `0x${string}` ``

Defined in: [packages/morpho-sdk/src/types/deallocation.ts:13](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/deallocation.ts#L13)

***

### amount

> `readonly` **amount**: `bigint`

Defined in: [packages/morpho-sdk/src/types/deallocation.ts:15](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/deallocation.ts#L15)

***

### marketParams?

> `readonly` `optional` **marketParams?**: [`MarketParams`](../../../blue-sdk/src/classes/MarketParams.md)

Defined in: [packages/morpho-sdk/src/types/deallocation.ts:14](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/deallocation.ts#L14)
