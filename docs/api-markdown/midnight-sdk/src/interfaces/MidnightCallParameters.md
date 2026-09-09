[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / MidnightCallParameters

# Interface: MidnightCallParameters

Defined in: [packages/midnight-sdk/src/fetch/types.ts:14](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/fetch/types.ts#L14)

Shared viem call parameters accepted by Midnight fetch helpers.

## Example

```ts
import type { MidnightCallParameters } from "@morpho-org/midnight-sdk";

const params: MidnightCallParameters = { blockTag: "latest" };
console.log(params.blockTag);
```

## Extended by

- [`DeploylessFetchParameters`](DeploylessFetchParameters.md)

## Properties

### account?

> `readonly` `optional` **account?**: `` `0x${string}` `` \| `Account`

Defined in: [packages/midnight-sdk/src/fetch/types.ts:16](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/fetch/types.ts#L16)

Account used as the `from` field for the read.

***

### blockNumber?

> `readonly` `optional` **blockNumber?**: `bigint`

Defined in: [packages/midnight-sdk/src/fetch/types.ts:18](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/fetch/types.ts#L18)

Block number used for the read.

***

### blockTag?

> `readonly` `optional` **blockTag?**: `BlockTag`

Defined in: [packages/midnight-sdk/src/fetch/types.ts:20](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/fetch/types.ts#L20)

Block tag used for the read.

***

### stateOverride?

> `readonly` `optional` **stateOverride?**: `StateOverride`

Defined in: [packages/midnight-sdk/src/fetch/types.ts:22](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/fetch/types.ts#L22)

State override set used for the read.
