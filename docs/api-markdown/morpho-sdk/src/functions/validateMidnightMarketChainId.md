[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / validateMidnightMarketChainId

# Function: validateMidnightMarketChainId()

> **validateMidnightMarketChainId**(`market`, `chainId`): `void`

Defined in: [packages/morpho-sdk/src/helpers/validate.ts:75](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/helpers/validate.ts#L75)

Validates that a raw or hydrated Midnight market belongs to the expected chain.

## Parameters

### market

[`MarketInput`](../../../midnight-sdk/src/type-aliases/MarketInput.md)

Midnight market params or hydrated market state.

### chainId

`number`

Expected EIP-155 chain id.

## Returns

`void`

Nothing when the market belongs to `chainId`.

## Throws

when the market belongs to another chain.

## Example

```ts
import { validateMidnightMarketChainId } from "@morpho-org/morpho-sdk";

validateMidnightMarketChainId(marketParams, 8453);
```
