[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [blue-sdk/src](../../../README.md) / [MarketUtils](../README.md) / getLiquidationIncentiveFactor

# Function: getLiquidationIncentiveFactor()

> **getLiquidationIncentiveFactor**(`config`): `bigint`

Defined in: [packages/blue-sdk/src/market/MarketUtils.ts:69](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/MarketUtils.ts#L69)

Returns the liquidation incentive factor for a given market params.

## Parameters

### config

The market params.

#### lltv

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

## Returns

`bigint`

The liquidation incentive factor, scaled by WAD.

## Example

```ts
import { MarketUtils } from "@morpho-org/blue-sdk";

const lif = MarketUtils.getLiquidationIncentiveFactor({ lltv: 86_0000000000000000n });
// lif satisfies bigint
```
