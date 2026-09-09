[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk-viem/src](../README.md) / decodeBytes32String

# Function: decodeBytes32String()

> **decodeBytes32String**(`hexOrStr`): `string`

Defined in: [packages/blue-sdk-viem/src/fetch/Token.ts:35](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/fetch/Token.ts#L35)

Decodes ERC20 `bytes32` metadata results while leaving string metadata unchanged.

## Parameters

### hexOrStr

`string`

Metadata value returned by an ERC20 `name` or `symbol` read.

## Returns

`string`

The decoded string for hex input, or the original string for non-hex input.

## Example

```ts
import { decodeBytes32String } from "@morpho-org/blue-sdk-viem";

const symbol = decodeBytes32String("0x5553444300000000000000000000000000000000000000000000000000000000");
```
