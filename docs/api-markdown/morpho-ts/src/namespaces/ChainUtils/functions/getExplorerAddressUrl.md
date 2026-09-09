[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [morpho-ts/src](../../../README.md) / [ChainUtils](../README.md) / getExplorerAddressUrl

# Function: getExplorerAddressUrl()

> **getExplorerAddressUrl**(`chainId`, `address`): `string`

Defined in: [packages/morpho-ts/src/chain.ts:133](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/chain.ts#L133)

Returns a block explorer address URL for a supported chain.

## Parameters

### chainId

[`ChainId`](../../../enumerations/ChainId.md)

The supported chain id.

### address

`string`

The address to link to.

## Returns

`string`

The block explorer URL for `address`.

## Example

```ts
import { ChainId, ChainUtils, NATIVE_ADDRESS } from "@morpho-org/morpho-ts";

const url = ChainUtils.getExplorerAddressUrl(ChainId.EthMainnet, NATIVE_ADDRESS);
// url satisfies string
```
