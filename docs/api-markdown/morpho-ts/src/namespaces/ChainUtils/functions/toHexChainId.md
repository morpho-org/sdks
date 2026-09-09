[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [morpho-ts/src](../../../README.md) / [ChainUtils](../README.md) / toHexChainId

# Function: toHexChainId()

> **toHexChainId**(`chainId`): `string`

Defined in: [packages/morpho-ts/src/chain.ts:98](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/chain.ts#L98)

Converts a supported chain id to its hexadecimal JSON-RPC form.

## Parameters

### chainId

[`ChainId`](../../../enumerations/ChainId.md)

The supported chain id.

## Returns

`string`

The chain id as a `0x`-prefixed hexadecimal string.

## Example

```ts
import { ChainId, ChainUtils } from "@morpho-org/morpho-ts";

const hexChainId = ChainUtils.toHexChainId(ChainId.EthMainnet);
// hexChainId === "0x1"
```
