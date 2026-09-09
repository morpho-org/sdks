[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [morpho-ts/src](../../../README.md) / [ChainUtils](../README.md) / hasReliableNativeBalance

# Function: hasReliableNativeBalance()

> **hasReliableNativeBalance**(`chainId`): `boolean`

Defined in: [packages/morpho-ts/src/chain.ts:78](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/chain.ts#L78)

Returns whether native token balances are reliable on a chain.

## Parameters

### chainId

`number`

The EIP-155 chain id to inspect.

## Returns

`boolean`

`false` only for chains whose metadata marks native balances as unreliable.

## Example

```ts
import { ChainId, ChainUtils } from "@morpho-org/morpho-ts";

const reliable = ChainUtils.hasReliableNativeBalance(ChainId.EthMainnet);
// reliable === true
```
