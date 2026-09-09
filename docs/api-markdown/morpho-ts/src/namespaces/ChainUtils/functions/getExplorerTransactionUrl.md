[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [morpho-ts/src](../../../README.md) / [ChainUtils](../README.md) / getExplorerTransactionUrl

# Function: getExplorerTransactionUrl()

> **getExplorerTransactionUrl**(`chainId`, `tx`): `string`

Defined in: [packages/morpho-ts/src/chain.ts:151](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/chain.ts#L151)

Returns a block explorer transaction URL for a supported chain.

## Parameters

### chainId

[`ChainId`](../../../enumerations/ChainId.md)

The supported chain id.

### tx

`string`

The transaction hash to link to.

## Returns

`string`

The block explorer URL for `tx`.

## Example

```ts
import { ChainId, ChainUtils } from "@morpho-org/morpho-ts";

const url = ChainUtils.getExplorerTransactionUrl(ChainId.EthMainnet, "0xabc");
// url satisfies string
```
