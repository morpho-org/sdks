[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk-viem/src](../README.md) / FetchParameters

# Type Alias: FetchParameters

> **FetchParameters** = `UnionPick`\<`CallParameters`, `"account"` \| `"blockNumber"` \| `"blockTag"` \| `"stateOverride"`\> & `object`

Defined in: [packages/blue-sdk-viem/src/types.ts:4](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/types.ts#L4)

Common viem call parameters accepted by blue-sdk-viem fetchers.

## Type Declaration

### ~~chainId?~~

> `optional` **chainId?**: `number`

Chain id used to resolve protocol addresses.

#### Deprecated

Configure the viem client's chain instead. This override will be removed in the next major version.
