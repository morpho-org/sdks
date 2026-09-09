[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [blue-sdk/src](../../../README.md) / [MarketUtils](../README.md) / rateToApy

# Function: rateToApy()

> **rateToApy**(`rate`): `number`

Defined in: [packages/blue-sdk/src/market/MarketUtils.ts:127](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/MarketUtils.ts#L127)

Returns the per-second rate continuously compounded over a year,
as calculated in Morpho Blue assuming the market is frequently accrued onchain.

## Parameters

### rate

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

The per-second rate to compound annually.

## Returns

`number`

The annual percentage yield as a JavaScript number.

## Example

```ts
import { MarketUtils } from "@morpho-org/blue-sdk";

const apy = MarketUtils.rateToApy(1n);
// apy satisfies number
```
