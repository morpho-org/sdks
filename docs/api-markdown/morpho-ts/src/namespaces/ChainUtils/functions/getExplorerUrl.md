[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [morpho-ts/src](../../../README.md) / [ChainUtils](../README.md) / getExplorerUrl

# Function: getExplorerUrl()

> **getExplorerUrl**(`chainId`): `string`

Defined in: [packages/morpho-ts/src/chain.ts:115](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/chain.ts#L115)

Returns the block explorer base URL for a supported chain.

## Parameters

### chainId

[`ChainId`](../../../enumerations/ChainId.md)

The supported chain id.

## Returns

`string`

The chain's configured block explorer base URL.

## Example

```ts
import { ChainId, ChainUtils } from "@morpho-org/morpho-ts";

const explorerUrl = ChainUtils.getExplorerUrl(ChainId.EthMainnet);
// explorerUrl === "https://etherscan.io"
```
