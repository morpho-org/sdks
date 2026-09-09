[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / validateReallocations

# ~~Function: validateReallocations()~~

> **validateReallocations**(`reallocations`, `targetMarketId`): `void`

Defined in: [packages/morpho-sdk/src/helpers/validate.ts:361](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/helpers/validate.ts#L361)

Validates that Vault V1 PublicAllocator reallocations are well-formed.

## Parameters

### reallocations

`Iterable`\<[`VaultV1Reallocation`](../interfaces/VaultV1Reallocation.md)\>

Vault V1 reallocations to validate.

### targetMarketId

[`MarketId`](../../../blue-sdk/src/type-aliases/MarketId.md)

The operation's target market ID.

## Returns

`void`

Nothing when every reallocation is valid.

## Throws

when a reallocation fee is negative.

## Throws

when a reallocation has no withdrawals.

## Throws

when a withdrawal amount is non-positive.

## Throws

when a withdrawal references the target market.

## Throws

when withdrawals are not strictly market-id sorted.

## Deprecated

Vault V1 PublicAllocator validation will be removed in the next major. Use Vault V2
reallocations for new integrations.

## Example

```ts
import type { BlueMarketId } from "@morpho-org/morpho-sdk/types";
import { validateReallocations } from "@morpho-org/morpho-sdk";
import { zeroHash } from "viem";

const result: void = validateReallocations([], zeroHash as BlueMarketId);
```
