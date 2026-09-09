[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / getChainAddress

# Function: getChainAddress()

> **getChainAddress**(`chainId`, `label`): `` `0x${string}` ``

Defined in: [packages/morpho-ts/src/addresses.ts:2168](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/addresses.ts#L2168)

Returns one configured address from a chain registry entry.

## Parameters

### chainId

`number`

The EIP-155 chain id.

### label

[`AddressLabel`](../type-aliases/AddressLabel.md)

Dot-separated address label to resolve.

## Returns

`` `0x${string}` ``

The configured address at `label`.

## Throws

UnsupportedChainIdError when no address registry exists for `chainId`.

## Throws

UnknownAddressError when `chainId` is supported but `label` has no registered address.

## Example

```ts
import { getChainAddress } from "@morpho-org/morpho-ts";

const midnight = getChainAddress(31337, "midnight");
// midnight satisfies `0x${string}`
```
