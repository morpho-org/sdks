[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / validateChainId

# Function: validateChainId()

> **validateChainId**(`clientChainId`, `expectedChainId`): `void`

Defined in: [packages/morpho-sdk/src/helpers/validate.ts:201](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/helpers/validate.ts#L201)

Validates that the viem client chain ID matches the expected chain ID.
Throws [ChainIdMismatchError](../classes/ChainIdMismatchError.md) if they differ.

## Parameters

### clientChainId

`number` \| `undefined`

Chain ID reported by the viem client (may be undefined).

### expectedChainId

`number`

Chain ID expected by the entity or action.

## Returns

`void`
