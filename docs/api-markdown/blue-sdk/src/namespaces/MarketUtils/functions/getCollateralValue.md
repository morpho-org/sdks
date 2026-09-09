[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [blue-sdk/src](../../../README.md) / [MarketUtils](../README.md) / getCollateralValue

# Function: getCollateralValue()

> **getCollateralValue**(`collateral`, `__namedParameters`): `bigint` \| `undefined`

Defined in: [packages/blue-sdk/src/market/MarketUtils.ts:373](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/MarketUtils.ts#L373)

Returns the value of a given amount of collateral quoted in loan assets.
Return `undefined` iff the market's price is undefined.

## Parameters

### collateral

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

The collateral amount.

### \_\_namedParameters

#### price?

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

## Returns

`bigint` \| `undefined`

The collateral value in loan assets, or `undefined` when price is unavailable.

## Example

```ts
import { MarketUtils, ORACLE_PRICE_SCALE } from "@morpho-org/blue-sdk";

const value = MarketUtils.getCollateralValue(2n, { price: ORACLE_PRICE_SCALE });
// value === 2n
```
