[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / DeploylessFetchParameters

# Interface: DeploylessFetchParameters

Defined in: [packages/midnight-sdk/src/fetch/types.ts:36](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/fetch/types.ts#L36)

Deployless read mode accepted by deployless-capable Midnight fetch helpers.

## Example

```ts
import type { DeploylessFetchParameters } from "@morpho-org/midnight-sdk";

const params: DeploylessFetchParameters = { deployless: "force" };
console.log(params.deployless);
```

## Extends

- [`MidnightCallParameters`](MidnightCallParameters.md)

## Properties

### account?

> `readonly` `optional` **account?**: `` `0x${string}` `` \| `Account`

Defined in: [packages/midnight-sdk/src/fetch/types.ts:16](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/fetch/types.ts#L16)

Account used as the `from` field for the read.

#### Inherited from

[`MidnightCallParameters`](MidnightCallParameters.md).[`account`](MidnightCallParameters.md#account)

***

### blockNumber?

> `readonly` `optional` **blockNumber?**: `bigint`

Defined in: [packages/midnight-sdk/src/fetch/types.ts:18](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/fetch/types.ts#L18)

Block number used for the read.

#### Inherited from

[`MidnightCallParameters`](MidnightCallParameters.md).[`blockNumber`](MidnightCallParameters.md#blocknumber)

***

### blockTag?

> `readonly` `optional` **blockTag?**: `BlockTag`

Defined in: [packages/midnight-sdk/src/fetch/types.ts:20](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/fetch/types.ts#L20)

Block tag used for the read.

#### Inherited from

[`MidnightCallParameters`](MidnightCallParameters.md).[`blockTag`](MidnightCallParameters.md#blocktag)

***

### deployless?

> `readonly` `optional` **deployless?**: `boolean` \| `"force"`

Defined in: [packages/midnight-sdk/src/fetch/types.ts:46](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/fetch/types.ts#L46)

If `true`, deployless-capable fetchers use deployless reads and fall back to direct reads if they fail.

If `"force"`, deployless-capable fetchers use deployless reads without fallback.

If `false`, deployless-capable fetchers use direct reads.

Default is `true` for fetchers that implement deployless reads.

***

### stateOverride?

> `readonly` `optional` **stateOverride?**: `StateOverride`

Defined in: [packages/midnight-sdk/src/fetch/types.ts:22](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/fetch/types.ts#L22)

State override set used for the read.

#### Inherited from

[`MidnightCallParameters`](MidnightCallParameters.md).[`stateOverride`](MidnightCallParameters.md#stateoverride)
