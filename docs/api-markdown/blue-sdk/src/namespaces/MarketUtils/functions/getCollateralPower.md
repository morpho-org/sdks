[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [blue-sdk/src](../../../README.md) / [MarketUtils](../README.md) / getCollateralPower

# Function: getCollateralPower()

> **getCollateralPower**(`collateral`, `__namedParameters`): `bigint`

Defined in: [packages/blue-sdk/src/market/MarketUtils.ts:351](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/MarketUtils.ts#L351)

Returns the borrow power of a collateral amount before oracle pricing.

## Parameters

### collateral

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

The collateral amount.

### \_\_namedParameters

#### lltv

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

## Returns

`bigint`

The collateral amount multiplied by LLTV.

## Example

```ts
import { MarketUtils } from "@morpho-org/blue-sdk";

const power = MarketUtils.getCollateralPower(100n, { lltv: 50_0000000000000000n });
// power === 50n
```
