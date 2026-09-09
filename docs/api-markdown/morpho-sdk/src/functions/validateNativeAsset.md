[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / validateNativeAsset

# Function: validateNativeAsset()

> **validateNativeAsset**(`chainId`, `asset`): `void`

Defined in: [packages/morpho-sdk/src/helpers/validate.ts:220](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/helpers/validate.ts#L220)

Validates that the given asset is the chain's wrapped native token.
Used by any action that may receive `nativeAmount` — the SDK wraps native
into wNative, so the target asset must be wNative for the action to succeed.

## Parameters

### chainId

`number`

The chain to look up wNative on.

### asset

`` `0x${string}` ``

The asset address to check (collateral, loan, vault asset…).

## Returns

`void`

## Throws

if wNative is not configured for the chain.

## Throws

if the asset is not wNative.
