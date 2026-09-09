[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / getChainAddresses

# Function: getChainAddresses()

> **getChainAddresses**(`chainId`): [`ChainAddresses`](../interfaces/ChainAddresses.md)

Defined in: [packages/morpho-ts/src/addresses.ts:2145](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/addresses.ts#L2145)

Returns the protocol address registry for a chain.

## Parameters

### chainId

`number`

The EIP-155 chain id.

## Returns

[`ChainAddresses`](../interfaces/ChainAddresses.md)

The configured protocol, adapter, factory, and token addresses for `chainId`.

## Throws

when no address registry exists for `chainId`.

## Example

```ts
import { ChainId, getChainAddresses } from "@morpho-org/morpho-ts";

const chainAddresses = getChainAddresses(ChainId.EthMainnet);
// chainAddresses satisfies ChainAddresses
```
