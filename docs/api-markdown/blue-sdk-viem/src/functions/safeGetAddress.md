[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk-viem/src](../README.md) / safeGetAddress

# Function: safeGetAddress()

> **safeGetAddress**(`address`): `` `0x${string}` ``

Defined in: [packages/blue-sdk-viem/src/utils.ts:83](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/utils.ts#L83)

Normalizes an address string through viem checksum validation after lowercasing it.

## Parameters

### address

`string`

Address string to normalize.

## Returns

`` `0x${string}` ``

The checksummed viem address.

## Example

```ts
import { safeGetAddress } from "@morpho-org/blue-sdk-viem";

const address = safeGetAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
```
