[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk-viem/src](../README.md) / DeploylessFetchParameters

# Type Alias: DeploylessFetchParameters

> **DeploylessFetchParameters** = [`FetchParameters`](FetchParameters.md) & `object`

Defined in: [packages/blue-sdk-viem/src/types.ts:17](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/types.ts#L17)

Fetch parameters for readers that can use deployless bytecode queries.

## Type Declaration

### deployless?

> `optional` **deployless?**: `boolean` \| `"force"`

If `true`, the function will use deployless reads and fallback to multicall if it fails.

If `"force"`, the function will use deployless reads without fallback to multicall. If deployless reads fail, the function will throw an error.

If `false`, the function will use multicall reads.

Default is `true`.
